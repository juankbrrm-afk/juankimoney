import { randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { prisma } from '@cantara/db';
import { extensionFor, uploadIntentSchema, VOICE_SAMPLE_LIMITS } from '@cantara/shared';
import { storageKeys } from '@cantara/ai';
import { requireAuth } from '../auth.js';
import { badRequest, notFound } from '../errors.js';
import type { AppContext } from '../context.js';

/**
 * Subida directa al almacén mediante URL prefirmada.
 *
 * El audio **no atraviesa la API**. Diez minutos de WAV son decenas de
 * megabytes; hacerlos pasar por el servidor consumiría memoria y ancho de
 * banda por cada usuario que graba, y obligaría a dimensionar la API por el
 * peso de los archivos en vez de por el número de peticiones.
 *
 * El flujo tiene dos pasos —intención y confirmación— porque el PUT ocurre
 * fuera de nuestro control: hasta que el navegador confirma, la fila queda
 * en `PENDING` y es candidata a limpieza.
 */
export async function uploadRoutes(app: FastifyInstance, ctx: AppContext): Promise<void> {
  app.post(
    '/uploads',
    { config: { rateLimit: { max: 60, timeWindow: '10 minutes' } } },
    async (request) => {
      const user = await requireAuth(request);
      const input = uploadIntentSchema.parse(request.body);

      if (input.sizeBytes > ctx.config.UPLOAD_MAX_BYTES) {
        throw badRequest('El archivo es demasiado grande');
      }

      const uploadId = randomUUID();
      const key = storageKeys.voiceSample(user.id, uploadId, extensionFor(input.contentType));

      const upload = await prisma.upload.create({
        data: {
          id: uploadId,
          userId: user.id,
          storageKey: key,
          fileName: input.fileName.slice(0, 255),
          contentType: input.contentType,
          sizeBytes: input.sizeBytes,
          durationSeconds: input.durationSeconds ?? null,
        },
      });

      const signed = await ctx.storage.signedUploadUrl(key, input.contentType, 900);

      return {
        uploadId: upload.id,
        uploadUrl: signed.url,
        storageKey: key,
        headers: signed.headers,
        expiresAt: new Date(Date.now() + 900_000).toISOString(),
      };
    },
  );

  /**
   * Confirmación tras el PUT.
   *
   * Se comprueba que el objeto existe de verdad en el almacén en lugar de
   * fiarse del cliente: si el PUT falló a medias, el usuario debe enterarse
   * ahora y no cuando el entrenamiento no encuentre el archivo.
   */
  app.post('/uploads/:id/confirm', async (request) => {
    const user = await requireAuth(request);
    const { id } = request.params as { id: string };

    const upload = await prisma.upload.findFirst({ where: { id, userId: user.id } });
    if (!upload) throw notFound('Subida no encontrada');

    if (!(await ctx.storage.exists(upload.storageKey))) {
      throw badRequest('El archivo no llegó al almacén. Vuelve a intentarlo.');
    }

    const body = (request.body ?? {}) as { durationSeconds?: number };
    const duration = body.durationSeconds ?? upload.durationSeconds ?? null;

    if (duration !== null && duration > VOICE_SAMPLE_LIMITS.maxClipSeconds) {
      throw badRequest(
        `Cada grabación puede durar como máximo ${VOICE_SAMPLE_LIMITS.maxClipSeconds / 60} minutos`,
      );
    }

    const confirmed = await prisma.upload.update({
      where: { id: upload.id },
      data: { status: 'CONFIRMED', confirmedAt: new Date(), durationSeconds: duration },
    });

    return {
      id: confirmed.id,
      fileName: confirmed.fileName,
      durationSeconds: confirmed.durationSeconds,
      sizeBytes: confirmed.sizeBytes,
    };
  });

  app.delete('/uploads/:id', async (request, reply) => {
    const user = await requireAuth(request);
    const { id } = request.params as { id: string };

    const upload = await prisma.upload.findFirst({ where: { id, userId: user.id } });
    if (!upload) throw notFound('Subida no encontrada');

    // El objeto se borra primero: si falla la fila, queda un huérfano en el
    // almacén que la limpieza recoge. Al revés quedaría audio del usuario sin
    // referencia y sin forma de encontrarlo para borrarlo.
    await ctx.storage.delete(upload.storageKey).catch(() => {});
    await prisma.upload.delete({ where: { id: upload.id } });

    return reply.status(204).send();
  });
}
