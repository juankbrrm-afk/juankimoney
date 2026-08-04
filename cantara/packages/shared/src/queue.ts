/**
 * Contrato de las colas, compartido entre productor (API) y consumidor
 * (worker).
 *
 * Solo tipos y nombres: sin dependencia de BullMQ, para que este módulo pueda
 * importarse también desde el navegador sin arrastrar Redis al bundle.
 */

export const QUEUE_NAMES = {
  voiceTraining: 'voice-training',
  songGeneration: 'song-generation',
} as const;

export type QueueName = (typeof QUEUE_NAMES)[keyof typeof QUEUE_NAMES];

export interface VoiceTrainingJobData {
  readonly jobId: string;
  readonly userId: string;
  readonly voiceModelId: string;
}

export interface SongGenerationJobData {
  readonly jobId: string;
  readonly userId: string;
  readonly songVersionId: string;
}

export type JobPayload = VoiceTrainingJobData | SongGenerationJobData;

/**
 * Canal de Redis por el que el worker publica progreso y la API lo reenvía
 * por SSE. Uno por trabajo: un suscriptor no recibe eventos que no le tocan.
 */
export function progressChannel(jobId: string): string {
  return `cantara:job:${jobId}`;
}

/**
 * Política de reintentos.
 *
 * Tres intentos con retroceso exponencial cubren los fallos transitorios de
 * proveedor. Más intentos solo alargarían la espera del usuario ante un fallo
 * que ya es permanente; el pipeline, además, reanuda desde el último
 * artefacto, así que un reintento no repite el trabajo caro.
 */
export const JOB_OPTIONS = {
  attempts: 3,
  backoff: { type: 'exponential' as const, delay: 5000 },
  removeOnComplete: { age: 86_400, count: 1000 },
  removeOnFail: { age: 604_800 },
} as const;
