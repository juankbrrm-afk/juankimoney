/**
 * Constantes de audio y umbrales de aceptación de muestras.
 *
 * Los umbrales de calidad no son arbitrarios: un modelo de voz entrenado con
 * material ruidoso o saturado produce canto metálico, y el usuario culpa al
 * producto, no a su micrófono. Es más barato rechazar pronto y explicar por
 * qué.
 */

export const AUDIO_MIME_TYPES = [
  'audio/wav',
  'audio/x-wav',
  'audio/wave',
  'audio/mpeg',
  'audio/mp4',
  'audio/x-m4a',
  'audio/aac',
  'audio/ogg',
  'audio/webm',
  'audio/flac',
] as const;
export type AudioMimeType = (typeof AUDIO_MIME_TYPES)[number];

export const AUDIO_EXTENSIONS: Readonly<Record<string, string>> = {
  'audio/wav': 'wav',
  'audio/x-wav': 'wav',
  'audio/wave': 'wav',
  'audio/mpeg': 'mp3',
  'audio/mp4': 'm4a',
  'audio/x-m4a': 'm4a',
  'audio/aac': 'aac',
  'audio/ogg': 'ogg',
  'audio/webm': 'webm',
  'audio/flac': 'flac',
};

export function isSupportedAudioType(mime: string): mime is AudioMimeType {
  return (AUDIO_MIME_TYPES as readonly string[]).includes(mime);
}

export function extensionFor(mime: string): string {
  return AUDIO_EXTENSIONS[mime] ?? 'bin';
}

/** Requisitos de las muestras de voz, alineados con el brief (2–10 minutos). */
export const VOICE_SAMPLE_LIMITS = {
  minTotalSeconds: 120,
  maxTotalSeconds: 600,
  /** Por debajo de esto una muestra suelta no aporta contexto útil. */
  minClipSeconds: 5,
  maxClipSeconds: 300,
  maxClips: 30,
  maxBytesPerClip: 50 * 1024 * 1024,
} as const;

/** Umbrales del análisis de calidad ejecutado antes de entrenar. */
export const QUALITY_THRESHOLDS = {
  /** Relación señal/ruido mínima en dB. Por debajo, el modelo aprende el ruido. */
  minSnrDb: 15,
  /** Fracción de muestras en clipping que se tolera antes de rechazar. */
  maxClippingRatio: 0.01,
  /** Proporción máxima de silencio: más que esto y hay poca voz real. */
  maxSilenceRatio: 0.6,
  /** Nivel RMS mínimo en dBFS; por debajo, la grabación está demasiado baja. */
  minRmsDbfs: -40,
} as const;

/** Formatos de exportación ofrecidos al usuario. */
export const EXPORT_FORMATS = ['mp3', 'wav'] as const;
export type ExportFormat = (typeof EXPORT_FORMATS)[number];

export const EXPORT_SPECS: Readonly<
  Record<ExportFormat, { mime: string; label: string; detail: string }>
> = {
  mp3: { mime: 'audio/mpeg', label: 'MP3', detail: '320 kbps · para compartir' },
  wav: { mime: 'audio/wav', label: 'WAV', detail: '24-bit / 44.1 kHz · para producir' },
};

/** Formato interno de trabajo del pipeline. Todo se normaliza a esto. */
export const WORKING_FORMAT = {
  sampleRate: 44_100,
  channels: 2,
  bitDepth: 24,
} as const;

/** Los modelos de voz se entrenan en mono; el estéreo no aporta y duplica el coste. */
export const TRAINING_FORMAT = {
  sampleRate: 44_100,
  channels: 1,
  bitDepth: 16,
} as const;

export interface AudioQualityReport {
  readonly durationSeconds: number;
  readonly sampleRate: number;
  readonly channels: number;
  readonly rmsDbfs: number;
  readonly peakDbfs: number;
  readonly snrDb: number;
  readonly clippingRatio: number;
  readonly silenceRatio: number;
  /** 0–100. Se muestra al usuario junto a cada muestra. */
  readonly score: number;
  readonly issues: readonly QualityIssue[];
}

export type QualityIssue = 'too_short' | 'too_quiet' | 'clipping' | 'noisy' | 'mostly_silence';

export const QUALITY_ISSUE_LABELS: Readonly<Record<QualityIssue, string>> = {
  too_short: 'Demasiado corta',
  too_quiet: 'Volumen muy bajo',
  clipping: 'Audio saturado',
  noisy: 'Ruido de fondo alto',
  mostly_silence: 'Casi todo silencio',
};

/**
 * Puntuación 0–100 a partir de las métricas medidas.
 *
 * Cada penalización está acotada para que un único defecto grave no lleve la
 * nota a cero: una muestra ruidosa pero utilizable debe distinguirse de una
 * inservible.
 */
export function scoreQuality(metrics: {
  snrDb: number;
  clippingRatio: number;
  silenceRatio: number;
  rmsDbfs: number;
  durationSeconds: number;
}): { score: number; issues: QualityIssue[] } {
  const issues: QualityIssue[] = [];
  let score = 100;

  if (metrics.durationSeconds < VOICE_SAMPLE_LIMITS.minClipSeconds) {
    issues.push('too_short');
    score -= 40;
  }

  if (metrics.snrDb < QUALITY_THRESHOLDS.minSnrDb) {
    issues.push('noisy');
    const deficit = QUALITY_THRESHOLDS.minSnrDb - metrics.snrDb;
    score -= Math.min(35, deficit * 3);
  }

  // El clipping recibe la penalización más dura a propósito: es distorsión
  // irreversible. El ruido de fondo se puede atenuar en el preprocesado; una
  // onda recortada ya perdió la información y el modelo aprende el artefacto.
  if (metrics.clippingRatio > QUALITY_THRESHOLDS.maxClippingRatio) {
    issues.push('clipping');
    score -= Math.min(45, metrics.clippingRatio * 900);
  }

  if (metrics.silenceRatio > QUALITY_THRESHOLDS.maxSilenceRatio) {
    issues.push('mostly_silence');
    score -= Math.min(25, (metrics.silenceRatio - QUALITY_THRESHOLDS.maxSilenceRatio) * 80);
  }

  if (metrics.rmsDbfs < QUALITY_THRESHOLDS.minRmsDbfs) {
    issues.push('too_quiet');
    score -= 20;
  }

  return { score: Math.max(0, Math.round(score)), issues };
}

/** Una muestra por debajo de 40 no entra al entrenamiento. */
export const MIN_USABLE_SCORE = 40;

export function formatDuration(seconds: number): string {
  const safe = Math.max(0, Math.floor(seconds));
  const minutes = Math.floor(safe / 60);
  const rest = safe % 60;
  return `${minutes}:${String(rest).padStart(2, '0')}`;
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
