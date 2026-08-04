/**
 * Proceso worker.
 *
 * Consume las dos colas y ejecuta los pipelines. Se despliega y escala por
 * separado de la API porque su presión es distinta: la API crece con usuarios
 * concurrentes, el worker con trabajos concurrentes, y este último está
 * limitado por la cuota de los proveedores de IA, no por la CPU.
 */

import { Worker, type Job } from 'bullmq';
import { Redis } from 'ioredis';
import pino from 'pino';
import { disconnect, prisma, refundJobCredits } from '@cantara/db';
import {
  QUEUE_NAMES,
  type SongGenerationJobData,
  type VoiceTrainingJobData,
} from '@cantara/shared';
import { createProviders, createStorage } from '@cantara/ai';
import { handleVoiceTraining, type HandlerDeps } from './handlers/train-voice.js';
import { handleSongGeneration } from './handlers/generate-song.js';

const logger = pino({
  level: process.env.LOG_LEVEL ?? 'info',
  ...(process.env.NODE_ENV === 'production'
    ? {}
    : { transport: { target: 'pino-pretty', options: { colorize: true } } }),
});

const redisUrl = process.env.REDIS_URL ?? 'redis://localhost:6379';

// BullMQ usa comandos bloqueantes; sin `maxRetriesPerRequest: null` ioredis
// los cancelaría por su cuenta y el worker perdería trabajos.
const connection = new Redis(redisUrl, { maxRetriesPerRequest: null });
const publisher = new Redis(redisUrl, { maxRetriesPerRequest: null });

const providers = await createProviders(process.env, logger);
const storage = createStorage(process.env, logger);

const deps: HandlerDeps = { providers, storage, redis: publisher, logger };

/**
 * Concurrencia.
 *
 * Baja a propósito: cada trabajo hace varias llamadas a proveedores externos
 * con cuota, así que subirla no acelera nada y solo consigue chocar con sus
 * límites de tasa. Para más rendimiento se añaden réplicas del proceso, que
 * es lo que reparte la carga de verdad.
 */
const TRAINING_CONCURRENCY = Number(process.env.TRAINING_CONCURRENCY ?? 2);
const GENERATION_CONCURRENCY = Number(process.env.GENERATION_CONCURRENCY ?? 3);

const voiceWorker = new Worker<VoiceTrainingJobData>(
  QUEUE_NAMES.voiceTraining,
  async (job: Job<VoiceTrainingJobData>) => {
    logger.info({ jobId: job.data.jobId, attempt: job.attemptsMade + 1 }, 'Entrenando voz');
    await recordAttempt(job.data.jobId, job.attemptsMade + 1);
    await handleVoiceTraining(job.data, deps);
  },
  { connection, concurrency: TRAINING_CONCURRENCY, lockDuration: 900_000 },
);

const songWorker = new Worker<SongGenerationJobData>(
  QUEUE_NAMES.songGeneration,
  async (job: Job<SongGenerationJobData>) => {
    logger.info({ jobId: job.data.jobId, attempt: job.attemptsMade + 1 }, 'Generando canción');
    await recordAttempt(job.data.jobId, job.attemptsMade + 1);
    await handleSongGeneration(job.data, deps);
  },
  { connection, concurrency: GENERATION_CONCURRENCY, lockDuration: 900_000 },
);

async function recordAttempt(jobId: string, attempts: number): Promise<void> {
  await prisma.job.update({ where: { id: jobId }, data: { attempts } }).catch(() => undefined);
}

/**
 * Agotados los reintentos, el trabajo queda definitivamente fallido.
 *
 * Los manejadores solo reembolsan ante fallos permanentes; los transitorios
 * relanzan la excepción para que BullMQ reintente. Este evento es el único
 * punto donde se sabe que ya no habrá más intentos, así que es aquí donde se
 * cierra el estado y se devuelven los créditos.
 */
for (const [worker, name] of [
  [voiceWorker, 'voice-training'],
  [songWorker, 'song-generation'],
] as const) {
  worker.on('failed', async (job, error) => {
    if (!job) return;

    const exhausted = job.attemptsMade >= (job.opts.attempts ?? 1);
    logger.error(
      { err: error, queue: name, jobId: job.data.jobId, attempt: job.attemptsMade, exhausted },
      'Trabajo fallido',
    );

    if (!exhausted) return;

    await prisma.job
      .update({
        where: { id: job.data.jobId },
        data: {
          status: 'failed',
          errorCode: 'internal',
          errorMessage: 'No pudimos completar el trabajo. No se te han cobrado créditos.',
          finishedAt: new Date(),
        },
      })
      .catch(() => undefined);

    await refundJobCredits(job.data.jobId).catch((refundError) => {
      // Un reembolso perdido es dinero del usuario: se registra con nivel
      // alto para que salte en las alertas y pueda repararse a mano.
      logger.error({ err: refundError, jobId: job.data.jobId }, 'FALLÓ EL REEMBOLSO');
    });
  });

  worker.on('error', (error) => {
    logger.error({ err: error, queue: name }, 'Error del worker');
  });
}

logger.info(
  `Worker activo. Colas: ${QUEUE_NAMES.voiceTraining} (x${TRAINING_CONCURRENCY}), ${QUEUE_NAMES.songGeneration} (x${GENERATION_CONCURRENCY})`,
);

// Cierre ordenado: se deja terminar el trabajo en curso antes de soltar las
// conexiones. Matar un entrenamiento a mitad desperdicia minutos de GPU ya
// pagados.
let shuttingDown = false;

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, async () => {
    if (shuttingDown) return;
    shuttingDown = true;

    logger.info(`${signal} recibido, terminando el trabajo en curso…`);

    await Promise.allSettled([voiceWorker.close(), songWorker.close()]);
    await Promise.allSettled([connection.quit(), publisher.quit()]);
    await disconnect();

    process.exit(0);
  });
}
