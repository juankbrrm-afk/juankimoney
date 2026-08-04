/**
 * Puertos: lo que el pipeline necesita, expresado sin mencionar a ningún
 * proveedor.
 *
 * El dominio depende exclusivamente de estas interfaces. Cambiar ElevenLabs
 * por Suno, o RVC por seed-vc, es escribir un adaptador y cambiar una
 * variable de entorno — nunca tocar `pipeline/`.
 */

import type {
  AudioQualityReport,
  ExportFormat,
  Genre,
  Language,
  Lyrics,
  SectionKind,
  SongStructure,
  VocalTimbre,
} from '@cantara/shared';

/** Audio en memoria con su formato. Es la moneda de cambio entre etapas. */
export interface AudioBuffer {
  readonly data: Uint8Array;
  readonly mime: string;
  readonly sampleRate: number;
  readonly channels: number;
  readonly durationSeconds: number;
  /**
   * URL de descarga del artefacto, cuando el pipeline ya lo ha publicado.
   *
   * Los proveedores que corren en GPU ajena no reciben bytes: reciben una URL
   * y la descargan ellos. El pipeline la firma al pasar el artefacto; los
   * adaptadores locales simplemente la ignoran.
   */
  readonly url?: string;
}

/** Progreso dentro de una etapa larga, para que la barra no se congele. */
export type ProgressFn = (fraction: number, note?: string) => void | Promise<void>;

export interface ProviderContext {
  /** Señal de cancelación: el usuario puede abortar un trabajo en curso. */
  readonly signal?: AbortSignal;
  readonly onProgress?: ProgressFn;
}

// ── Letras ───────────────────────────────────────────────────

export interface LyricsBrief {
  readonly prompt: string;
  readonly genre: Genre;
  readonly language: Language;
  readonly structure: SongStructure;
  readonly title?: string;
}

export interface LyricsProvider {
  readonly name: string;
  generate(brief: LyricsBrief, ctx?: ProviderContext): Promise<Lyrics>;
}

// ── Música ───────────────────────────────────────────────────

export interface CompositionSection {
  readonly kind: SectionKind;
  readonly durationSeconds: number;
  readonly lines: readonly string[];
}

export interface CompositionPlan {
  readonly title: string;
  readonly genre: Genre;
  readonly language: Language;
  readonly bpm: number;
  readonly prompt: string;
  readonly durationSeconds: number;
  readonly instrumental: boolean;
  readonly sections: readonly CompositionSection[];
}

export interface CompositionResult {
  readonly mix: AudioBuffer;
  /**
   * Stems si el proveedor los expone. Cuando llegan, el pipeline se salta
   * la separación entera: es más barato y de más calidad que separar una
   * mezcla ya renderizada.
   */
  readonly stems?: {
    readonly vocals: AudioBuffer;
    readonly instrumental: AudioBuffer;
  };
  readonly providerTrackId?: string;
}

export interface MusicProvider {
  readonly name: string;
  compose(plan: CompositionPlan, ctx?: ProviderContext): Promise<CompositionResult>;
}

// ── Separación de stems ──────────────────────────────────────

export interface Stems {
  readonly vocals: AudioBuffer;
  readonly instrumental: AudioBuffer;
}

export interface StemSeparator {
  readonly name: string;
  separate(mix: AudioBuffer, ctx?: ProviderContext): Promise<Stems>;
}

// ── Voz ──────────────────────────────────────────────────────

/** Referencia al modelo entrenado en el proveedor externo. */
export interface VoiceHandle {
  readonly provider: string;
  readonly modelId: string;
  readonly meta?: Record<string, unknown>;
}

export interface TrainingSample {
  readonly id: string;
  readonly audio: AudioBuffer;
  readonly quality: AudioQualityReport;
}

export interface VoiceTrainer {
  readonly name: string;
  /** `instant` indica zero-shot: sin fase de entrenamiento real. */
  readonly instant: boolean;
  train(samples: readonly TrainingSample[], ctx?: ProviderContext): Promise<VoiceHandle>;
  /**
   * Borrado en el proveedor externo. Sin esto, el «derecho de supresión»
   * dejaría copias del modelo fuera de nuestro control.
   */
  delete(handle: VoiceHandle): Promise<void>;
}

export interface ConversionOptions {
  readonly handle: VoiceHandle;
  /** URL de la voz guía, para los conversores que la descargan por HTTP. */
  readonly vocalsUrl?: string;
  /** Semitonos de transposición; ver `pitchShiftFor` en shared/music. */
  readonly pitchShift: number;
  readonly timbre: VocalTimbre;
  /** 0–1: cuánto del timbre original se conserva. Más alto = más fiel. */
  readonly strength?: number;
}

export interface VoiceConverter {
  readonly name: string;
  /** Convierte la voz guía en la voz del usuario, conservando la melodía. */
  convert(
    vocals: AudioBuffer,
    options: ConversionOptions,
    ctx?: ProviderContext,
  ): Promise<AudioBuffer>;
}

// ── Análisis de audio ────────────────────────────────────────

export interface AudioAnalyzer {
  readonly name: string;
  analyze(audio: AudioBuffer | Uint8Array): Promise<AudioQualityReport>;
}

// ── Mezcla, masterización, codificación ──────────────────────

export interface MixOptions {
  /** Ganancia de la voz respecto al instrumental, en dB. */
  readonly vocalGainDb?: number;
  readonly instrumentalGainDb?: number;
}

export interface AudioMixer {
  readonly name: string;
  mix(vocals: AudioBuffer, instrumental: AudioBuffer, options?: MixOptions): Promise<AudioBuffer>;
}

export interface MasteringProvider {
  readonly name: string;
  master(audio: AudioBuffer, genre: Genre, ctx?: ProviderContext): Promise<AudioBuffer>;
}

export interface AudioEncoder {
  readonly name: string;
  encode(audio: AudioBuffer, format: ExportFormat): Promise<AudioBuffer>;
  /** Picos normalizados 0–1 para dibujar la onda sin descargar el audio. */
  waveform(audio: AudioBuffer, buckets: number): Promise<number[]>;
}

// ── Almacenamiento de objetos ────────────────────────────────

export interface StoragePort {
  put(key: string, data: Uint8Array, contentType: string): Promise<void>;
  get(key: string): Promise<Uint8Array>;
  delete(key: string): Promise<void>;
  exists(key: string): Promise<boolean>;
  /** URL prefirmada de descarga; el bucket nunca es público. */
  signedDownloadUrl(key: string, expiresInSeconds?: number): Promise<string>;
  signedUploadUrl(
    key: string,
    contentType: string,
    expiresInSeconds?: number,
  ): Promise<{ url: string; headers: Record<string, string> }>;
}

/** Conjunto completo de capacidades que el pipeline necesita. */
export interface AiProviders {
  readonly lyrics: LyricsProvider;
  readonly music: MusicProvider;
  readonly separator: StemSeparator;
  readonly trainer: VoiceTrainer;
  readonly converter: VoiceConverter;
  readonly analyzer: AudioAnalyzer;
  readonly mixer: AudioMixer;
  readonly mastering: MasteringProvider;
  readonly encoder: AudioEncoder;
}
