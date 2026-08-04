import type { FastifyInstance } from 'fastify';
import { prisma } from '@cantara/db';
import {
  computeProgress,
  isTerminal,
  stageLabel,
  type JobProgressEvent,
  type JobStatus,
  type JobType,
} from '@cantara/shared';
import { requireAuth } from '../auth.js';
import { notFound } from '../errors.js';
import { subscribeToJob } from '../queue.js';
import type { AppContext } from '../context.js';

export async function jobRoutes(app: FastifyInstance, ctx: AppContext): Promise<void> {
  app.get('/jobs/:id', async (request) => {
    const user = await requireAuth(request);
    const { id } = request.params as { id: string };

    const job = await prisma.job.findFirst({ where: { id, userId: user.id } });
    if (!job) throw notFound('Trabajo no encontrado');

    return { job: toDto(job) };
  });

  /**
   * Progreso en vivo por Server-Sent Events.
   *
   * SSE y no WebSockets porque el flujo es unidireccional servidor→cliente:
   * un WebSocket sería capacidad bidireccional sin usar, con más estado que
   * mantener y peor comportamiento tras proxies.
   *
   * El primer evento se emite desde base de datos, no desde Redis. Eso es lo
   * que permite que alguien que recarga la página a mitad del entrenamiento
   * vea su barra donde la dejó en lugar de esperar al siguiente latido del
   * worker.
   */
  app.get('/jobs/:id/stream', async (request, reply) => {
    const user = await requireAuth(request);
    const { id } = request.params as { id: string };

    const job = await prisma.job.findFirst({ where: { id, userId: user.id } });
    if (!job) throw notFound('Trabajo no encontrado');

    reply.raw.writeHead(200, {
      'content-type': 'text/event-stream',
      'cache-control': 'no-cache, no-transform',
      connection: 'keep-alive',
      // Sin esto, nginx acumula el stream en buffer y el progreso llega a
      // ráfagas o directamente al final, que es peor que no tenerlo.
      'x-accel-buffering': 'no',
    });

    const send = (event: JobProgressEvent) => {
      if (reply.raw.writableEnded) return;
      reply.raw.write(`data: ${JSON.stringify(event)}\n\n`);
    };

    send(toEvent(job));

    // Un trabajo ya terminado no necesita suscripción: se envía su estado
    // final y se cierra.
    if (isTerminal(job.status as JobStatus)) {
      reply.raw.end();
      return reply;
    }

    const unsubscribe = subscribeToJob(ctx.config.REDIS_URL, job.id, (event) => {
      send(event);
      if (isTerminal(event.status)) {
        cleanup();
        reply.raw.end();
      }
    });

    // Comentario de keep-alive: mantiene viva la conexión frente a proxies
    // que cierran por inactividad durante una etapa larga y silenciosa.
    const heartbeat = setInterval(() => {
      if (reply.raw.writableEnded) return;
      reply.raw.write(': keep-alive\n\n');
    }, 20_000);

    // Red de seguridad: si el worker muriera sin publicar su estado final,
    // el stream se cerraría solo en lugar de dejar la conexión colgada para
    // siempre.
    const maxDuration = setTimeout(() => {
      cleanup();
      reply.raw.end();
    }, 1_800_000);

    let cleaned = false;
    function cleanup() {
      if (cleaned) return;
      cleaned = true;
      clearInterval(heartbeat);
      clearTimeout(maxDuration);
      unsubscribe();
    }

    request.raw.on('close', cleanup);

    return reply;
  });

  app.get('/jobs', async (request) => {
    const user = await requireAuth(request);

    const jobs = await prisma.job.findMany({
      where: { userId: user.id, status: { in: ['queued', 'running'] } },
      orderBy: { createdAt: 'desc' },
      take: 20,
    });

    return { jobs: jobs.map(toDto) };
  });
}

type JobRow = Awaited<ReturnType<typeof prisma.job.findFirstOrThrow>>;

function toDto(job: JobRow) {
  return {
    id: job.id,
    type: job.type as JobType,
    status: job.status as JobStatus,
    stage: job.stage,
    progress: job.progress,
    message: job.message,
    error: job.errorMessage,
    resultId: job.songVersionId ?? job.voiceModelId,
    createdAt: job.createdAt.toISOString(),
    updatedAt: job.updatedAt.toISOString(),
  };
}

function toEvent(job: JobRow): JobProgressEvent {
  const type = job.type as JobType;

  return {
    jobId: job.id,
    type,
    status: job.status as JobStatus,
    stage: job.stage,
    // El progreso guardado manda; si faltara, se reconstruye desde la etapa
    // para que el cliente nunca reciba un 0 engañoso a mitad del trabajo.
    progress: job.progress || (job.stage ? computeProgress(type, job.stage) : 0),
    message: job.message || (job.stage ? stageLabel(type, job.stage) : 'En cola'),
    ...(job.errorMessage ? { error: job.errorMessage } : {}),
    ...(job.songVersionId || job.voiceModelId
      ? { resultId: job.songVersionId ?? job.voiceModelId! }
      : {}),
    at: job.updatedAt.toISOString(),
  };
}
