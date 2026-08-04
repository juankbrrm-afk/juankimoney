import type { FastifyInstance } from 'fastify';
import { chargeCredits, prisma } from '@cantara/db';
import {
  CONSENT_VERSION,
  CREDIT_COSTS,
  VOICE_SAMPLE_LIMITS,
  createVoiceSchema,
  formatDuration,
} from '@cantara/shared';
import { requireAuth } from '../auth.js';
import { badRequest, conflict, notFound } from '../errors.js';
import { enqueueVoiceTraining } from '../queue.js';
import { serializeVoiceModel } from '../serialize.js';
import type { AppContext } from '../context.js';

export async function voiceRoutes(app: FastifyInstance, ctx: AppContext): Promise<void> {
  app.get('/voices', async (request) => {
    const user = await requireAuth(request);

    const models = await prisma.voiceModel.findMany({
      where: { userId: user.id },
      include: { samples: { include: { upload: true } } },
      orderBy: { createdAt: 'desc' },
    });

    const activeJobs = await activeJobsByVoice(models.map((model) => model.id));

    return {
      voices: await Promise.all(
        models.map((model) =>
          serializeVoiceModel(model, ctx.storage, activeJobs.get(model.id) ?? null),
        ),
      ),
    };
  });

  app.get('/voices/:id', async (request) => {
    const user = await requireAuth(request);
    const { id } = request.params as { id: string };

    const model = await prisma.voiceModel.findFirst({
      where: { id, userId: user.id },
      include: { samples: { include: { upload: true } } },
    });
    if (!model) throw notFound('Modelo de voz no encontrado');

    const activeJobs = await activeJobsByVoice([model.id]);

    return { voice: await serializeVoiceModel(model, ctx.storage, activeJobs.get(model.id) ?? null) };
  });

  app.post(
    '/voices',
    { config: { rateLimit: { max: 10, timeWindow: '1 hour' } } },
    async (request, reply) => {
      const user = await requireAuth(request);
      const input = createVoiceSchema.parse(request.body);

      // El consentimiento se exige en el servidor, no solo en el formulario.
      // Ver docs/05-legal-and-consent.md.
      if (input.consent.version !== CONSENT_VERSION) {
        throw badRequest(
          'El texto de consentimiento ha cambiado. Recarga la página y vuelve a aceptarlo.',
        );
      }

      const uploads = await prisma.upload.findMany({
        where: { id: { in: input.uploadIds }, userId: user.id, status: 'CONFIRMED' },
      });

      if (uploads.length !== input.uploadIds.length) {
        throw badRequest('Alguna de las grabaciones no se subió correctamente');
      }

      // Se valida la duración total antes de cobrar. Descubrir que faltan 40
      // segundos después de haber gastado 100 créditos sería inaceptable.
      const totalSeconds = uploads.reduce((sum, upload) => sum + (upload.durationSeconds ?? 0), 0);

      if (totalSeconds < VOICE_SAMPLE_LIMITS.minTotalSeconds) {
        throw badRequest(
          `Necesitamos al menos ${formatDuration(VOICE_SAMPLE_LIMITS.minTotalSeconds)} de grabación y tienes ${formatDuration(totalSeconds)}.`,
        );
      }

      if (totalSeconds > VOICE_SAMPLE_LIMITS.maxTotalSeconds) {
        throw badRequest(
          `El máximo es ${formatDuration(VOICE_SAMPLE_LIMITS.maxTotalSeconds)} y has subido ${formatDuration(totalSeconds)}.`,
        );
      }

      const cost = input.instant ? CREDIT_COSTS.instantVoice : CREDIT_COSTS.voiceTraining;

      // Consentimiento, modelo, muestras y trabajo se crean en una sola
      // transacción: o queda todo consistente o no queda nada.
      const { voiceModel, job } = await prisma.$transaction(async (tx) => {
        await tx.voiceConsent.upsert({
          where: { userId_version: { userId: user.id, version: CONSENT_VERSION } },
          create: {
            userId: user.id,
            version: CONSENT_VERSION,
            ip: request.ip,
            userAgent: request.headers['user-agent']?.slice(0, 500) ?? null,
          },
          update: {},
        });

        const created = await tx.voiceModel.create({
          data: {
            userId: user.id,
            name: input.name,
            register: input.register === 'high' ? 'HIGH' : 'LOW',
            instant: input.instant,
            status: 'PENDING',
            totalSeconds,
            samples: {
              create: uploads.map((upload) => ({
                uploadId: upload.id,
                durationSeconds: upload.durationSeconds ?? 0,
              })),
            },
          },
          include: { samples: { include: { upload: true } } },
        });

        const createdJob = await tx.job.create({
          data: {
            userId: user.id,
            type: 'voice-training',
            status: 'queued',
            message: 'En cola',
            creditsReserved: cost,
            voiceModelId: created.id,
          },
        });

        return { voiceModel: created, job: createdJob };
      });

      // El cargo va fuera de la transacción anterior porque necesita su
      // propio bloqueo sobre la fila del usuario. Si falla por saldo
      // insuficiente, se deshace lo creado y el usuario recibe un 402.
      try {
        await chargeCredits({
          userId: user.id,
          amount: cost,
          reason: 'voice_training',
          description: `Entrenamiento de voz: ${input.name}`,
          referenceId: job.id,
          referenceType: 'job',
          idempotencyKey: `voice-training:${job.id}`,
        });
      } catch (error) {
        await prisma.voiceModel.delete({ where: { id: voiceModel.id } }).catch(() => {});
        throw error;
      }

      await enqueueVoiceTraining(ctx.config.REDIS_URL, {
        jobId: job.id,
        userId: user.id,
        voiceModelId: voiceModel.id,
      });

      return reply.status(202).send({
        voice: await serializeVoiceModel(voiceModel, ctx.storage, job.id),
        jobId: job.id,
      });
    },
  );

  /**
   * Borrado real: audio, modelo en el proveedor y fila.
   *
   * Ver docs/05-legal-and-consent.md — un derecho de supresión que deja
   * copias en el proveedor externo no es un derecho de supresión.
   */
  app.delete('/voices/:id', async (request, reply) => {
    const user = await requireAuth(request);
    const { id } = request.params as { id: string };

    const model = await prisma.voiceModel.findFirst({
      where: { id, userId: user.id },
      include: { samples: { include: { upload: true } } },
    });
    if (!model) throw notFound('Modelo de voz no encontrado');

    const running = await prisma.job.findFirst({
      where: { voiceModelId: model.id, status: { in: ['queued', 'running'] } },
    });
    if (running) {
      throw conflict('No se puede borrar un modelo mientras se está entrenando');
    }

    for (const sample of model.samples) {
      await ctx.storage.delete(sample.upload.storageKey).catch(() => {});
    }
    if (model.previewKey) await ctx.storage.delete(model.previewKey).catch(() => {});

    // Las canciones ya generadas se conservan —son obra del usuario— pero
    // pierden la referencia al modelo, que es lo que se está borrando.
    await prisma.voiceModel.delete({ where: { id: model.id } });

    return reply.status(204).send();
  });
}

/** Trabajo activo por modelo de voz, para que la UI reenganche su progreso. */
async function activeJobsByVoice(voiceModelIds: string[]): Promise<Map<string, string>> {
  if (voiceModelIds.length === 0) return new Map();

  const jobs = await prisma.job.findMany({
    where: { voiceModelId: { in: voiceModelIds }, status: { in: ['queued', 'running'] } },
    orderBy: { createdAt: 'desc' },
    select: { id: true, voiceModelId: true },
  });

  const map = new Map<string, string>();
  for (const job of jobs) {
    if (job.voiceModelId && !map.has(job.voiceModelId)) map.set(job.voiceModelId, job.id);
  }
  return map;
}
