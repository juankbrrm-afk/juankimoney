/**
 * Resolución de proveedores desde el entorno.
 *
 * Este es el único punto donde se decide qué implementación concreta atiende
 * cada puerto. Que exista un solo sitio es lo que permite cambiar de
 * proveedor sin buscar `elevenlabs` por el código.
 *
 * Principio de degradación: si se pide un proveedor y falta su
 * configuración, se registra una advertencia y se cae al adaptador `local` en
 * lugar de reventar al arrancar. Un despliegue sin `ELEVENLABS_API_KEY` debe
 * levantarse y decir qué le falta, no negarse a arrancar.
 */

import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Genre } from '@cantara/shared';
import type { AiProviders, StoragePort } from './ports.js';
import {
  LocalInstantVoiceTrainer,
  LocalLyricsProvider,
  LocalMasteringProvider,
  LocalMixer,
  LocalMusicProvider,
  LocalStemSeparator,
  LocalVoiceConverter,
  LocalVoiceTrainer,
} from './providers/local/index.js';
import { AudioQualityAnalyzer } from './providers/analyzer.js';
import { resolveEncoder } from './providers/encoder.js';
import { AnthropicLyricsProvider } from './providers/anthropic.js';
import { ElevenLabsMusicProvider } from './providers/elevenlabs.js';
import {
  DemucsSeparator,
  MatcheringProvider,
  RvcVoiceConverter,
  RvcVoiceTrainer,
  SeedVcConverter,
  SeedVcTrainer,
  type ReplicateConfig,
} from './providers/replicate.js';
import { FfmpegMasteringProvider } from './providers/mastering.js';
import { LocalDiskStorage, S3Storage } from './storage.js';

export interface ProviderEnv {
  readonly LYRICS_PROVIDER?: string;
  readonly MUSIC_PROVIDER?: string;
  readonly VOICE_PROVIDER?: string;
  readonly STEMS_PROVIDER?: string;
  readonly MASTERING_PROVIDER?: string;

  readonly ANTHROPIC_API_KEY?: string;
  readonly ANTHROPIC_MODEL?: string;
  readonly ELEVENLABS_API_KEY?: string;
  readonly REPLICATE_API_TOKEN?: string;

  readonly RVC_TRAIN_MODEL?: string;
  readonly RVC_INFER_MODEL?: string;
  readonly SEEDVC_MODEL?: string;
  readonly DEMUCS_MODEL?: string;
  readonly MATCHERING_MODEL?: string;
}

export type Logger = { warn: (message: string) => void; info: (message: string) => void };

const noopLogger: Logger = { warn: () => {}, info: () => {} };

function replicateConfig(env: ProviderEnv): ReplicateConfig | null {
  if (!env.REPLICATE_API_TOKEN) return null;
  return {
    apiToken: env.REPLICATE_API_TOKEN,
    rvcTrainModel: env.RVC_TRAIN_MODEL,
    rvcInferModel: env.RVC_INFER_MODEL,
    seedVcModel: env.SEEDVC_MODEL,
    demucsModel: env.DEMUCS_MODEL,
    matcheringModel: env.MATCHERING_MODEL,
  };
}

/** Referencias de masterización por género. Deben ser material con derechos. */
const MASTERING_REFERENCES: Readonly<Partial<Record<Genre, string>>> = {};

export async function createProviders(
  env: ProviderEnv = process.env as ProviderEnv,
  logger: Logger = noopLogger,
): Promise<AiProviders> {
  const replicate = replicateConfig(env);

  // ── Letras ──
  let lyrics = new LocalLyricsProvider() as AiProviders['lyrics'];
  if (env.LYRICS_PROVIDER === 'anthropic') {
    if (env.ANTHROPIC_API_KEY) {
      lyrics = new AnthropicLyricsProvider({
        apiKey: env.ANTHROPIC_API_KEY,
        model: env.ANTHROPIC_MODEL,
      });
    } else {
      logger.warn('LYRICS_PROVIDER=anthropic pero falta ANTHROPIC_API_KEY; se usa el local');
    }
  }

  // ── Música ──
  let music = new LocalMusicProvider() as AiProviders['music'];
  if (env.MUSIC_PROVIDER === 'elevenlabs') {
    if (env.ELEVENLABS_API_KEY) {
      music = new ElevenLabsMusicProvider({ apiKey: env.ELEVENLABS_API_KEY });
    } else {
      logger.warn('MUSIC_PROVIDER=elevenlabs pero falta ELEVENLABS_API_KEY; se usa el local');
    }
  }

  // ── Voz ──
  let trainer = new LocalVoiceTrainer() as AiProviders['trainer'];
  let converter = new LocalVoiceConverter() as AiProviders['converter'];

  if (env.VOICE_PROVIDER === 'rvc') {
    if (replicate) {
      trainer = new RvcVoiceTrainer(replicate);
      converter = new RvcVoiceConverter(replicate);
    } else {
      logger.warn('VOICE_PROVIDER=rvc pero falta REPLICATE_API_TOKEN; se usa el local');
    }
  } else if (env.VOICE_PROVIDER === 'seedvc') {
    if (replicate) {
      trainer = new SeedVcTrainer();
      converter = new SeedVcConverter(replicate);
    } else {
      logger.warn('VOICE_PROVIDER=seedvc pero falta REPLICATE_API_TOKEN; se usa el local');
    }
  }

  // ── Separación ──
  let separator = new LocalStemSeparator() as AiProviders['separator'];
  if (env.STEMS_PROVIDER === 'demucs') {
    if (replicate) {
      separator = new DemucsSeparator(replicate);
    } else {
      logger.warn('STEMS_PROVIDER=demucs pero falta REPLICATE_API_TOKEN; se usa el local');
    }
  }

  // ── Masterización ──
  let mastering = new LocalMasteringProvider() as AiProviders['mastering'];
  if (env.MASTERING_PROVIDER === 'matchering') {
    if (replicate) {
      mastering = new MatcheringProvider(replicate, MASTERING_REFERENCES);
    } else {
      logger.warn('MASTERING_PROVIDER=matchering pero falta REPLICATE_API_TOKEN; se usa el local');
    }
  } else if (env.MASTERING_PROVIDER === 'loudnorm') {
    mastering = new FfmpegMasteringProvider(new LocalMasteringProvider());
  }

  const encoder = await resolveEncoder();
  logger.info(
    `Proveedores: letras=${lyrics.name} música=${music.name} voz=${trainer.name}/${converter.name} stems=${separator.name} máster=${mastering.name} codec=${encoder.name}`,
  );

  return {
    lyrics,
    music,
    separator,
    trainer,
    converter,
    analyzer: new AudioQualityAnalyzer(),
    mixer: new LocalMixer(),
    mastering,
    encoder,
  };
}

/** Entrenador zero-shot, para cuando el usuario elige «voz instantánea». */
export function instantTrainerFor(providers: AiProviders): AiProviders['trainer'] {
  return providers.trainer.instant ? providers.trainer : new LocalInstantVoiceTrainer();
}

export interface StorageEnv {
  readonly S3_ENDPOINT?: string;
  readonly S3_REGION?: string;
  readonly S3_BUCKET?: string;
  readonly S3_ACCESS_KEY_ID?: string;
  readonly S3_SECRET_ACCESS_KEY?: string;
  readonly S3_FORCE_PATH_STYLE?: string;
  readonly S3_PUBLIC_URL?: string;
  readonly LOCAL_STORAGE_DIR?: string;
  readonly API_PUBLIC_URL?: string;
  readonly NODE_ENV?: string;
}

export function createStorage(
  env: StorageEnv = process.env as StorageEnv,
  logger: Logger = noopLogger,
): StoragePort {
  const hasS3 = Boolean(env.S3_BUCKET && env.S3_ACCESS_KEY_ID && env.S3_SECRET_ACCESS_KEY);

  if (hasS3) {
    return new S3Storage({
      endpoint: env.S3_ENDPOINT,
      region: env.S3_REGION ?? 'us-east-1',
      bucket: env.S3_BUCKET!,
      accessKeyId: env.S3_ACCESS_KEY_ID!,
      secretAccessKey: env.S3_SECRET_ACCESS_KEY!,
      forcePathStyle: env.S3_FORCE_PATH_STYLE === 'true',
      publicUrl: env.S3_PUBLIC_URL,
    });
  }

  // El disco no sirve en producción: varios workers no comparten sistema de
  // archivos, así que un audio escrito por uno sería invisible para el resto.
  if (env.NODE_ENV === 'production') {
    throw new Error(
      'Configuración de S3 incompleta. En producción hace falta S3_BUCKET, S3_ACCESS_KEY_ID y S3_SECRET_ACCESS_KEY.',
    );
  }

  // La ruta se resuelve a absoluta anclada en la raíz del monorepo, no en el
  // cwd. `npm run --workspace` ejecuta cada app desde su propio directorio,
  // así que una ruta relativa daría a la API y al worker dos almacenes
  // distintos: la API guardaría el audio y el worker no lo encontraría.
  const directory = env.LOCAL_STORAGE_DIR
    ? resolve(env.LOCAL_STORAGE_DIR)
    : join(monorepoRoot(), '.cantara-storage');

  logger.warn(
    `Sin configuración de S3: se usa almacenamiento en disco en ${directory} (solo desarrollo)`,
  );

  return new LocalDiskStorage(directory, env.API_PUBLIC_URL ?? 'http://localhost:4000');
}

/**
 * Raíz del monorepo: el `package.json` más cercano hacia arriba que declara
 * workspaces. Si no se encuentra, se cae al cwd, que es el comportamiento
 * razonable fuera de un monorepo.
 */
function monorepoRoot(): string {
  let directory = dirname(fileURLToPath(import.meta.url));

  for (let depth = 0; depth < 10; depth += 1) {
    const manifest = join(directory, 'package.json');
    try {
      if (JSON.parse(readFileSync(manifest, 'utf8')).workspaces) return directory;
    } catch {
      // Sin package.json legible en este nivel: se sigue subiendo.
    }

    const parent = dirname(directory);
    if (parent === directory) break;
    directory = parent;
  }

  return process.cwd();
}
