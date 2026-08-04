/**
 * Adaptadores sobre Replicate: RVC, seed-vc, Demucs y Matchering.
 *
 * Replicate cubre de una sola integración las cuatro piezas que necesitan
 * GPU. Es la vía más rápida a producción; migrar a GPU propia significa
 * escribir otro adaptador para estos mismos puertos, sin tocar el pipeline.
 *
 * Los identificadores de versión son configurables porque cambian cada vez
 * que el autor de un modelo publica una revisión — fijarlos en el código los
 * convertiría en deuda inmediata.
 */

import type { Genre } from '@cantara/shared';
import type {
  AudioBuffer,
  ConversionOptions,
  MasteringProvider,
  ProviderContext,
  StemSeparator,
  Stems,
  TrainingSample,
  VoiceConverter,
  VoiceHandle,
  VoiceTrainer,
} from '../ports.js';
import { pollUntil, requestBytes, requestJson } from '../http.js';

const REPLICATE_API = 'https://api.replicate.com/v1';

export interface ReplicateConfig {
  readonly apiToken: string;
  readonly rvcTrainVersion?: string;
  readonly rvcInferVersion?: string;
  readonly seedVcVersion?: string;
  readonly demucsVersion?: string;
  readonly matcheringVersion?: string;
}

interface Prediction {
  id: string;
  status: 'starting' | 'processing' | 'succeeded' | 'failed' | 'canceled';
  output?: unknown;
  error?: string;
  logs?: string;
}

class ReplicateClient {
  constructor(private readonly token: string) {}

  private get headers(): Record<string, string> {
    return { authorization: `Bearer ${this.token}` };
  }

  /** Crea una predicción y espera a que termine, informando del progreso. */
  async run(version: string, input: Record<string, unknown>, ctx?: ProviderContext): Promise<unknown> {
    const created = await requestJson<Prediction>({
      url: `${REPLICATE_API}/predictions`,
      provider: 'replicate',
      headers: this.headers,
      signal: ctx?.signal,
      body: { version, input },
    });

    return pollUntil(
      async () => {
        const prediction = await requestJson<Prediction>({
          url: `${REPLICATE_API}/predictions/${created.id}`,
          method: 'GET',
          provider: 'replicate',
          headers: this.headers,
          signal: ctx?.signal,
        });

        if (prediction.status === 'succeeded') {
          return { done: true, value: prediction.output };
        }
        if (prediction.status === 'failed' || prediction.status === 'canceled') {
          throw new Error(`Replicate ${prediction.status}: ${prediction.error ?? 'sin detalle'}`);
        }

        return { done: false, progress: parseProgress(prediction.logs) };
      },
      { signal: ctx?.signal, onProgress: ctx?.onProgress },
    );
  }
}

/**
 * Extrae el porcentaje de los logs del modelo.
 *
 * Muchos modelos de Replicate imprimen una barra de tqdm. Aprovecharla da
 * progreso real en vez de una estimación por tiempo, y es la diferencia entre
 * una barra que informa y una que entretiene.
 */
function parseProgress(logs?: string): number | undefined {
  if (!logs) return undefined;
  const matches = [...logs.matchAll(/(\d{1,3})%/g)];
  const last = matches.at(-1)?.[1];
  if (!last) return undefined;
  return Math.min(0.95, Number(last) / 100);
}

async function fetchOutputAudio(output: unknown, signal?: AbortSignal): Promise<Uint8Array> {
  const url = typeof output === 'string' ? output : Array.isArray(output) ? output[0] : undefined;
  if (typeof url !== 'string') {
    throw new Error('Replicate devolvió una salida sin URL de audio');
  }
  return requestBytes({ url, method: 'GET', provider: 'replicate', signal });
}

function asBuffer(data: Uint8Array, durationSeconds = 0): AudioBuffer {
  return { data, mime: 'audio/wav', sampleRate: 44_100, channels: 2, durationSeconds };
}

// ── Entrenamiento y conversión (RVC) ─────────────────────────

/**
 * RVC requiere que las muestras estén accesibles por URL. El worker las
 * publica antes de llamar aquí, pasando las URLs prefirmadas: subir bytes
 * dentro del adaptador acoplaría este código al almacenamiento.
 */
export interface RvcTrainingInput extends TrainingSample {
  readonly url: string;
}

export class RvcVoiceTrainer implements VoiceTrainer {
  readonly name = 'rvc';
  readonly instant = false;

  private readonly client: ReplicateClient;

  constructor(private readonly config: ReplicateConfig) {
    this.client = new ReplicateClient(config.apiToken);
  }

  async train(samples: readonly TrainingSample[], ctx?: ProviderContext): Promise<VoiceHandle> {
    const urls = samples
      .map((sample) => (sample as Partial<RvcTrainingInput>).url)
      .filter((url): url is string => typeof url === 'string');

    if (urls.length === 0) {
      throw new Error('RVC necesita las muestras accesibles por URL prefirmada');
    }

    const version = this.config.rvcTrainVersion;
    if (!version) throw new Error('Falta RVC_TRAIN_VERSION en la configuración');

    const output = await this.client.run(
      version,
      {
        dataset_urls: urls,
        // 200 épocas es el equilibrio habitual con 2–10 minutos de material:
        // por debajo el timbre no cuaja y por encima se sobreajusta al ruido.
        epochs: 200,
        batch_size: 8,
        sample_rate: 40_000,
      },
      ctx,
    );

    const modelUrl = typeof output === 'string' ? output : (output as { model?: string })?.model;
    if (!modelUrl) throw new Error('RVC no devolvió el modelo entrenado');

    return { provider: 'rvc', modelId: modelUrl, meta: { sampleCount: samples.length } };
  }

  async delete(handle: VoiceHandle): Promise<void> {
    // Los pesos viven en el almacenamiento de salida de Replicate, que expira
    // solo. El borrado efectivo lo hace el worker sobre nuestra copia en S3;
    // se deja explícito para que quede constancia de por qué no hay llamada.
    void handle;
  }
}

export class RvcVoiceConverter implements VoiceConverter {
  readonly name = 'rvc';

  private readonly client: ReplicateClient;

  constructor(private readonly config: ReplicateConfig) {
    this.client = new ReplicateClient(config.apiToken);
  }

  async convert(
    vocals: AudioBuffer,
    options: ConversionOptions & { vocalsUrl?: string },
    ctx?: ProviderContext,
  ): Promise<AudioBuffer> {
    const version = this.config.rvcInferVersion;
    if (!version) throw new Error('Falta RVC_INFER_VERSION en la configuración');
    if (!options.vocalsUrl) {
      throw new Error('RVC necesita la voz guía accesible por URL prefirmada');
    }

    const output = await this.client.run(
      version,
      {
        input_audio: options.vocalsUrl,
        rvc_model: options.handle.modelId,
        pitch_change: options.pitchShift,
        // El algoritmo `rmvpe` es el más fiable extrayendo el tono de una voz
        // cantada con acompañamiento residual.
        f0_method: 'rmvpe',
        index_rate: options.strength ?? 0.75,
        filter_radius: 3,
        rms_mix_rate: 0.25,
        protect: 0.33,
      },
      ctx,
    );

    return asBuffer(await fetchOutputAudio(output, ctx?.signal), vocals.durationSeconds);
  }
}

// ── Voz instantánea (seed-vc, zero-shot) ─────────────────────

export class SeedVcTrainer implements VoiceTrainer {
  readonly name = 'seedvc';
  readonly instant = true;

  async train(samples: readonly TrainingSample[]): Promise<VoiceHandle> {
    // Zero-shot: no hay entrenamiento. El "modelo" es la muestra de
    // referencia, así que se elige la de mayor calidad y duración razonable.
    const best = [...samples].sort((a, b) => b.quality.score - a.quality.score)[0];
    if (!best) throw new Error('seed-vc necesita al menos una muestra de referencia');

    const url = (best as Partial<RvcTrainingInput>).url;
    if (!url) throw new Error('seed-vc necesita la muestra accesible por URL prefirmada');

    return { provider: 'seedvc', modelId: url, meta: { zeroShot: true, sampleId: best.id } };
  }

  async delete(): Promise<void> {
    // Nada que borrar en el proveedor: la referencia es nuestro propio audio.
  }
}

export class SeedVcConverter implements VoiceConverter {
  readonly name = 'seedvc';

  private readonly client: ReplicateClient;

  constructor(private readonly config: ReplicateConfig) {
    this.client = new ReplicateClient(config.apiToken);
  }

  async convert(
    vocals: AudioBuffer,
    options: ConversionOptions & { vocalsUrl?: string },
    ctx?: ProviderContext,
  ): Promise<AudioBuffer> {
    const version = this.config.seedVcVersion;
    if (!version) throw new Error('Falta SEEDVC_VERSION en la configuración');
    if (!options.vocalsUrl) throw new Error('seed-vc necesita la voz guía por URL prefirmada');

    const output = await this.client.run(
      version,
      {
        source: options.vocalsUrl,
        target: options.handle.modelId,
        // El modo canto preserva la melodía; sin él, seed-vc aplana el tono.
        f0_condition: true,
        semi_tone_shift: options.pitchShift,
        diffusion_steps: 30,
      },
      ctx,
    );

    return asBuffer(await fetchOutputAudio(output, ctx?.signal), vocals.durationSeconds);
  }
}

// ── Separación de stems (Demucs) ─────────────────────────────

export class DemucsSeparator implements StemSeparator {
  readonly name = 'demucs';

  private readonly client: ReplicateClient;

  constructor(private readonly config: ReplicateConfig) {
    this.client = new ReplicateClient(config.apiToken);
  }

  async separate(mix: AudioBuffer & { url?: string }, ctx?: ProviderContext): Promise<Stems> {
    const version = this.config.demucsVersion;
    if (!version) throw new Error('Falta DEMUCS_VERSION en la configuración');
    if (!mix.url) throw new Error('Demucs necesita la mezcla accesible por URL prefirmada');

    const output = (await this.client.run(
      version,
      {
        audio: mix.url,
        // `htdemucs_ft` es la variante afinada: más lenta, pero deja menos
        // instrumental filtrado en la pista vocal, que es justo lo que
        // arruinaría la conversión de voz posterior.
        model: 'htdemucs_ft',
        stem: 'vocals',
        output_format: 'wav',
      },
      ctx,
    )) as Record<string, string>;

    const vocalsUrl = output.vocals;
    const instrumentalUrl = output.no_vocals ?? output.other ?? output.accompaniment;

    if (!vocalsUrl || !instrumentalUrl) {
      throw new Error('Demucs no devolvió las dos pistas esperadas');
    }

    const [vocals, instrumental] = await Promise.all([
      requestBytes({ url: vocalsUrl, method: 'GET', provider: 'replicate', signal: ctx?.signal }),
      requestBytes({
        url: instrumentalUrl,
        method: 'GET',
        provider: 'replicate',
        signal: ctx?.signal,
      }),
    ]);

    return {
      vocals: asBuffer(vocals, mix.durationSeconds),
      instrumental: asBuffer(instrumental, mix.durationSeconds),
    };
  }
}

// ── Masterización (Matchering) ───────────────────────────────

/**
 * Masterización por referencia: se iguala la pista a una referencia comercial
 * del mismo género, así que un reguetón se masteriza contra un reguetón. Las
 * URLs de referencia se configuran por despliegue; deben ser material del que
 * se tengan derechos.
 */
export class MatcheringProvider implements MasteringProvider {
  readonly name = 'matchering';

  private readonly client: ReplicateClient;

  constructor(
    private readonly config: ReplicateConfig,
    private readonly references: Readonly<Partial<Record<Genre, string>>>,
  ) {
    this.client = new ReplicateClient(config.apiToken);
  }

  async master(
    audio: AudioBuffer & { url?: string },
    genre: Genre,
    ctx?: ProviderContext,
  ): Promise<AudioBuffer> {
    const version = this.config.matcheringVersion;
    const reference = this.references[genre];

    // Sin referencia para este género no hay nada que igualar. Devolver el
    // audio intacto es preferible a masterizarlo contra un género ajeno: el
    // pipeline aplicará el fallback de loudnorm.
    if (!version || !reference || !audio.url) return audio;

    const output = await this.client.run(
      version,
      { target: audio.url, reference },
      ctx,
    );

    return asBuffer(await fetchOutputAudio(output, ctx?.signal), audio.durationSeconds);
  }
}
