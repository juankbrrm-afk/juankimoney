/**
 * Lado productor de las colas y suscripción al progreso.
 *
 * La API encola y escucha; nunca ejecuta trabajo pesado. Las conexiones de
 * Redis se comparten por proceso: BullMQ abre una por cola y la suscripción
 * necesita la suya propia, porque un cliente en modo subscribe no puede
 * ejecutar otros comandos.
 */

import { Queue } from 'bullmq';
import { Redis } from 'ioredis';
import {
  JOB_OPTIONS,
  QUEUE_NAMES,
  progressChannel,
  type JobProgressEvent,
  type SongGenerationJobData,
  type VoiceTrainingJobData,
} from '@cantara/shared';

let connection: Redis | null = null;
let subscriber: Redis | null = null;
let voiceQueue: Queue<VoiceTrainingJobData> | null = null;
let songQueue: Queue<SongGenerationJobData> | null = null;

function getConnection(redisUrl: string): Redis {
  // `maxRetriesPerRequest: null` es requisito de BullMQ: sin él, un comando
  // bloqueante largo se cancelaría solo y el worker perdería trabajos.
  connection ??= new Redis(redisUrl, { maxRetriesPerRequest: null });
  return connection;
}

export function getVoiceQueue(redisUrl: string): Queue<VoiceTrainingJobData> {
  voiceQueue ??= new Queue<VoiceTrainingJobData>(QUEUE_NAMES.voiceTraining, {
    connection: getConnection(redisUrl),
    defaultJobOptions: JOB_OPTIONS,
  });
  return voiceQueue;
}

export function getSongQueue(redisUrl: string): Queue<SongGenerationJobData> {
  songQueue ??= new Queue<SongGenerationJobData>(QUEUE_NAMES.songGeneration, {
    connection: getConnection(redisUrl),
    defaultJobOptions: JOB_OPTIONS,
  });
  return songQueue;
}

export async function enqueueVoiceTraining(
  redisUrl: string,
  data: VoiceTrainingJobData,
): Promise<void> {
  // El `jobId` de dominio se usa también como identificador en BullMQ: si la
  // misma petición llega dos veces (reintento de red), la cola deduplica sola.
  await getVoiceQueue(redisUrl).add(QUEUE_NAMES.voiceTraining, data, { jobId: data.jobId });
}

export async function enqueueSongGeneration(
  redisUrl: string,
  data: SongGenerationJobData,
): Promise<void> {
  await getSongQueue(redisUrl).add(QUEUE_NAMES.songGeneration, data, { jobId: data.jobId });
}

/**
 * Suscripción al progreso de un trabajo.
 *
 * Devuelve una función de baja. La conexión de suscripción es única y se
 * multiplexan los canales sobre ella: abrir una por cliente SSE agotaría el
 * límite de conexiones de Redis con unas pocas decenas de usuarios mirando su
 * barra de progreso.
 */
export function subscribeToJob(
  redisUrl: string,
  jobId: string,
  onEvent: (event: JobProgressEvent) => void,
): () => void {
  subscriber ??= new Redis(redisUrl, { maxRetriesPerRequest: null });

  const channel = progressChannel(jobId);
  const handler = (incoming: string, payload: string) => {
    if (incoming !== channel) return;
    try {
      onEvent(JSON.parse(payload) as JobProgressEvent);
    } catch {
      // Un mensaje malformado no debe tumbar el stream del usuario.
    }
  };

  subscriber.on('message', handler);
  void subscriber.subscribe(channel);

  return () => {
    subscriber?.off('message', handler);
    void subscriber?.unsubscribe(channel);
  };
}

export async function closeQueues(): Promise<void> {
  await Promise.allSettled([
    voiceQueue?.close(),
    songQueue?.close(),
    subscriber?.quit(),
    connection?.quit(),
  ]);
}
