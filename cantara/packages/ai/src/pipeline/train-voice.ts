/**
 * Pipeline de entrenamiento de voz.
 *
 * El paso que de verdad importa aquí es el análisis de calidad: entrenar con
 * material malo produce un modelo malo, y el usuario culpa al producto. Se
 * mide antes, se descartan las muestras inservibles y, si lo que queda no
 * llega al mínimo, se falla con un motivo accionable en lugar de gastar
 * minutos de GPU en un resultado que decepcionará.
 */

import {
  JobError,
  MIN_USABLE_SCORE,
  QUALITY_THRESHOLDS,
  VOICE_SAMPLE_LIMITS,
  type AudioQualityReport,
} from '@cantara/shared';
import type { AiProviders, ProviderContext, StoragePort, TrainingSample, VoiceHandle } from '../ports.js';
import { ProviderHttpError } from '../http.js';
import type { StageReporter } from './generate-song.js';

export interface SampleInput {
  readonly id: string;
  readonly storageKey: string;
  readonly mime: string;
}

export interface TrainingRequest {
  readonly userId: string;
  readonly voiceModelId: string;
  readonly samples: readonly SampleInput[];
  /** Zero-shot: sin fase de entrenamiento real. */
  readonly instant: boolean;
}

export interface AnalyzedSample {
  readonly id: string;
  readonly quality: AudioQualityReport;
  readonly includedInTraining: boolean;
}

export interface TrainingResult {
  readonly handle: VoiceHandle;
  readonly analyzed: readonly AnalyzedSample[];
  readonly totalSeconds: number;
  /** Media ponderada por duración de las muestras utilizadas. */
  readonly qualityScore: number;
}

export interface TrainingDeps {
  readonly providers: AiProviders;
  readonly storage: StoragePort;
  readonly signal?: AbortSignal;
  readonly onStage: StageReporter;
  /**
   * URLs prefirmadas por clave de almacenamiento. Los proveedores de GPU
   * necesitan descargar el audio, y firmar aquí evita que el adaptador
   * conozca el almacenamiento.
   */
  readonly signUrl?: (storageKey: string) => Promise<string>;
}

export async function trainVoice(
  request: TrainingRequest,
  deps: TrainingDeps,
): Promise<TrainingResult> {
  const { providers, storage, signal } = deps;

  try {
    // ── 1. Descarga ───────────────────────────────────────────
    await deps.onStage('fetching', 0);

    const loaded: Array<{ id: string; storageKey: string; bytes: Uint8Array; mime: string }> = [];

    for (const [index, sample] of request.samples.entries()) {
      signal?.throwIfAborted();
      try {
        loaded.push({
          id: sample.id,
          storageKey: sample.storageKey,
          bytes: await storage.get(sample.storageKey),
          mime: sample.mime,
        });
      } catch {
        // Una muestra ilegible no debe tumbar el entrenamiento entero: se
        // omite y se decide al final si lo que queda basta.
        continue;
      }
      await deps.onStage('fetching', (index + 1) / request.samples.length);
    }

    if (loaded.length === 0) throw new JobError('audio_unreadable');

    // ── 2. Análisis de calidad ────────────────────────────────
    await deps.onStage('analyzing', 0);

    const analyzed: AnalyzedSample[] = [];
    const usable: TrainingSample[] = [];

    for (const [index, item] of loaded.entries()) {
      signal?.throwIfAborted();

      const quality = await providers.analyzer.analyze(item.bytes);
      const includedInTraining = quality.score >= MIN_USABLE_SCORE;

      analyzed.push({ id: item.id, quality, includedInTraining });

      if (includedInTraining) {
        const sample: TrainingSample & { url?: string; storageKey: string } = {
          id: item.id,
          storageKey: item.storageKey,
          audio: {
            data: item.bytes,
            mime: item.mime,
            sampleRate: quality.sampleRate,
            channels: quality.channels,
            durationSeconds: quality.durationSeconds,
          },
          quality,
        };
        if (deps.signUrl) sample.url = await deps.signUrl(item.storageKey);
        usable.push(sample);
      }

      await deps.onStage('analyzing', (index + 1) / loaded.length);
    }

    assertUsable(analyzed, usable);

    // ── 3. Preprocesado ───────────────────────────────────────
    await deps.onStage('preprocessing', 1);

    const totalSeconds = usable.reduce((sum, sample) => sum + sample.quality.durationSeconds, 0);

    // ── 4. Entrenamiento ──────────────────────────────────────
    await deps.onStage('training', 0);

    // Se acota por debajo de 1: solo el pipeline declara la etapa terminada,
    // y lo hace cuando el modelo ya está en la mano, no cuando el proveedor
    // dice haber acabado.
    const ctx: ProviderContext = {
      signal,
      onProgress: (fraction, note) => deps.onStage('training', Math.min(fraction, 0.99), note),
    };

    const handle = await providers.trainer.train(usable, ctx);

    await deps.onStage('training', 1);
    await deps.onStage('finalizing', 1);

    // Media ponderada por duración: una muestra de 3 minutos influye más en
    // el modelo resultante que una de 10 segundos, y la nota debe reflejarlo.
    const weighted = usable.reduce(
      (sum, sample) => sum + sample.quality.score * sample.quality.durationSeconds,
      0,
    );

    return {
      handle,
      analyzed,
      totalSeconds,
      qualityScore: totalSeconds > 0 ? Math.round(weighted / totalSeconds) : 0,
    };
  } catch (error) {
    if (error instanceof JobError) throw error;

    if (error instanceof ProviderHttpError) {
      throw new JobError(
        error.retryable ? 'provider_unavailable' : 'provider_rejected',
        error.message,
        error.retryable,
      );
    }

    if (error instanceof Error && error.name === 'AbortError') throw error;

    throw new JobError('internal', error instanceof Error ? error.message : String(error), true);
  }
}

/**
 * Decide si el material aceptado basta, y si no, por qué.
 *
 * El motivo concreto importa: «hay ruido de fondo» y «faltan 40 segundos»
 * llevan al usuario a acciones distintas. Se elige el defecto dominante entre
 * las muestras descartadas en vez de un mensaje genérico.
 */
function assertUsable(analyzed: readonly AnalyzedSample[], usable: readonly TrainingSample[]): void {
  const totalSeconds = usable.reduce((sum, sample) => sum + sample.quality.durationSeconds, 0);

  if (totalSeconds >= VOICE_SAMPLE_LIMITS.minTotalSeconds) return;

  const rejected = analyzed.filter((sample) => !sample.includedInTraining);

  if (rejected.length > 0) {
    const issues = rejected.flatMap((sample) => sample.quality.issues);
    const dominant = mostFrequent(issues);

    if (dominant === 'clipping') throw new JobError('audio_clipping');
    if (dominant === 'noisy') throw new JobError('audio_too_noisy');
  }

  throw new JobError('audio_too_short');
}

function mostFrequent<T extends string>(items: readonly T[]): T | null {
  const counts = new Map<T, number>();
  for (const item of items) counts.set(item, (counts.get(item) ?? 0) + 1);

  let best: T | null = null;
  let bestCount = 0;
  for (const [item, count] of counts) {
    if (count > bestCount) {
      best = item;
      bestCount = count;
    }
  }
  return best;
}

export { QUALITY_THRESHOLDS };
