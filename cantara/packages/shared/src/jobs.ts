/**
 * Etapas de los trabajos largos y su traducción a progreso.
 *
 * El porcentaje no se inventa en el frontend: cada etapa declara aquí el
 * tramo de la barra que ocupa, y el worker informa además del avance dentro
 * de la etapa actual. Así la barra refleja trabajo real y nunca retrocede.
 */

export const JOB_TYPES = ['voice-training', 'song-generation'] as const;
export type JobType = (typeof JOB_TYPES)[number];

export const JOB_STATUSES = ['queued', 'running', 'succeeded', 'failed', 'canceled'] as const;
export type JobStatus = (typeof JOB_STATUSES)[number];

export const TERMINAL_JOB_STATUSES: readonly JobStatus[] = ['succeeded', 'failed', 'canceled'];

export function isTerminal(status: JobStatus): boolean {
  return TERMINAL_JOB_STATUSES.includes(status);
}

export interface StageSpec<TStage extends string> {
  readonly id: TStage;
  /** Texto mostrado al usuario mientras la etapa corre. */
  readonly label: string;
  /** Porcentaje acumulado al terminar la etapa (0–100). */
  readonly progressAt: number;
}

// ── Entrenamiento de voz ─────────────────────────────────────

export const TRAINING_STAGES = [
  'fetching',
  'analyzing',
  'preprocessing',
  'training',
  'finalizing',
] as const;
export type TrainingStage = (typeof TRAINING_STAGES)[number];

export const TRAINING_STAGE_SPECS: readonly StageSpec<TrainingStage>[] = [
  { id: 'fetching', label: 'Recuperando tus grabaciones', progressAt: 5 },
  { id: 'analyzing', label: 'Analizando calidad de audio', progressAt: 20 },
  { id: 'preprocessing', label: 'Normalizando y limpiando', progressAt: 35 },
  { id: 'training', label: 'Entrenando tu modelo de voz', progressAt: 90 },
  { id: 'finalizing', label: 'Guardando el modelo', progressAt: 100 },
];

// ── Generación de canción ────────────────────────────────────

export const GENERATION_STAGES = [
  'lyrics',
  'composition',
  'separation',
  'voice-conversion',
  'mixing',
  'mastering',
  'encoding',
] as const;
export type GenerationStage = (typeof GENERATION_STAGES)[number];

export const GENERATION_STAGE_SPECS: readonly StageSpec<GenerationStage>[] = [
  { id: 'lyrics', label: 'Escribiendo la letra', progressAt: 10 },
  { id: 'composition', label: 'Componiendo la música', progressAt: 40 },
  { id: 'separation', label: 'Separando voz e instrumental', progressAt: 55 },
  { id: 'voice-conversion', label: 'Cantando con tu voz', progressAt: 75 },
  { id: 'mixing', label: 'Mezclando', progressAt: 85 },
  { id: 'mastering', label: 'Masterizando', progressAt: 93 },
  { id: 'encoding', label: 'Exportando MP3 y WAV', progressAt: 100 },
];

export type AnyStage = TrainingStage | GenerationStage;

const SPECS_BY_TYPE: Record<JobType, readonly StageSpec<string>[]> = {
  'voice-training': TRAINING_STAGES.map(
    (id) => TRAINING_STAGE_SPECS.find((s) => s.id === id)!,
  ),
  'song-generation': GENERATION_STAGES.map(
    (id) => GENERATION_STAGE_SPECS.find((s) => s.id === id)!,
  ),
};

export function stageSpecs(type: JobType): readonly StageSpec<string>[] {
  return SPECS_BY_TYPE[type];
}

/**
 * Convierte (etapa, avance interno) en un porcentaje global monótono.
 *
 * `withinStage` es 0–1 y describe cuánto ha avanzado la etapa actual. Sirve
 * para que las etapas largas (entrenamiento, composición) no dejen la barra
 * congelada durante minutos.
 */
export function computeProgress(type: JobType, stage: string, withinStage = 0): number {
  const specs = stageSpecs(type);
  const index = specs.findIndex((s) => s.id === stage);
  if (index === -1) return 0;

  const previous = index === 0 ? 0 : specs[index - 1]!.progressAt;
  const current = specs[index]!.progressAt;
  const clamped = Math.min(Math.max(withinStage, 0), 1);

  return Math.round(previous + (current - previous) * clamped);
}

export function stageLabel(type: JobType, stage: string): string {
  return stageSpecs(type).find((s) => s.id === stage)?.label ?? 'Procesando';
}

/** Evento emitido por el worker y reenviado al navegador por SSE. */
export interface JobProgressEvent {
  readonly jobId: string;
  readonly type: JobType;
  readonly status: JobStatus;
  readonly stage: string | null;
  readonly progress: number;
  readonly message: string;
  /** Presente solo cuando `status === 'failed'`. */
  readonly error?: string;
  /** Identificador del recurso producido (voiceModelId o songVersionId). */
  readonly resultId?: string;
  readonly at: string;
}

/**
 * Códigos de error accionables.
 *
 * Existen para que el frontend pueda ofrecer la acción correcta —«vuelve a
 * grabar en un sitio silencioso»— en lugar de mostrar el mensaje crudo de un
 * proveedor externo.
 */
export const JOB_ERROR_CODES = [
  'audio_too_short',
  'audio_too_noisy',
  'audio_clipping',
  'audio_unreadable',
  'provider_unavailable',
  'provider_rejected',
  'insufficient_credits',
  'voice_not_ready',
  'internal',
] as const;
export type JobErrorCode = (typeof JOB_ERROR_CODES)[number];

export const JOB_ERROR_MESSAGES: Readonly<Record<JobErrorCode, string>> = {
  audio_too_short: 'Necesitamos al menos 2 minutos de grabación para entrenar tu voz.',
  audio_too_noisy: 'Hay demasiado ruido de fondo. Prueba a grabar en una habitación silenciosa.',
  audio_clipping: 'El audio está saturado. Baja el volumen de entrada y aleja el micrófono.',
  audio_unreadable: 'No pudimos leer alguno de los archivos. Usa WAV, MP3, M4A o WEBM.',
  provider_unavailable: 'El servicio de generación no responde. Lo reintentaremos en breve.',
  provider_rejected: 'El proveedor rechazó la petición. Revisa el prompt e inténtalo de nuevo.',
  insufficient_credits: 'No tienes créditos suficientes para esta operación.',
  voice_not_ready: 'Tu modelo de voz aún no está listo.',
  internal: 'Algo falló por nuestra parte. No se te han cobrado créditos.',
};

/** Error de dominio que el worker convierte en un fallo legible para el usuario. */
export class JobError extends Error {
  constructor(
    readonly code: JobErrorCode,
    /** Detalle técnico para los logs; nunca se muestra al usuario. */
    readonly detail?: string,
    /** Un fallo transitorio se reintenta; uno permanente, no. */
    readonly retryable = false,
  ) {
    super(JOB_ERROR_MESSAGES[code]);
    this.name = 'JobError';
  }

  get userMessage(): string {
    return JOB_ERROR_MESSAGES[this.code];
  }
}
