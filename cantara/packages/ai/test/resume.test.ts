/**
 * Reanudación tras fallo.
 *
 * La promesa del pipeline es que un reintento no vuelva a componer la
 * canción. Eso depende de dos cosas que se verifican aquí: que el error
 * arrastre los artefactos ya producidos, y que un segundo intento los use.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { JobError } from '@cantara/shared';
import type { AiProviders, StoragePort } from '../src/ports.js';
import { generateSong, type Artifacts, type ResumableError } from '../src/pipeline/generate-song.js';
import {
  LocalLyricsProvider,
  LocalMasteringProvider,
  LocalMixer,
  LocalMusicProvider,
  LocalStemSeparator,
  LocalVoiceConverter,
  LocalVoiceTrainer,
} from '../src/providers/local/index.js';
import { AudioQualityAnalyzer } from '../src/providers/analyzer.js';
import { PureJsEncoder } from '../src/providers/encoder.js';
import { ProviderHttpError } from '../src/http.js';

class MemoryStorage implements StoragePort {
  readonly objects = new Map<string, Uint8Array>();

  async put(key: string, data: Uint8Array): Promise<void> {
    this.objects.set(key, data);
  }
  async get(key: string): Promise<Uint8Array> {
    const found = this.objects.get(key);
    if (!found) throw new Error(`no existe: ${key}`);
    return found;
  }
  async delete(key: string): Promise<void> {
    this.objects.delete(key);
  }
  async exists(key: string): Promise<boolean> {
    return this.objects.has(key);
  }
  async signedDownloadUrl(key: string): Promise<string> {
    return `memory://${key}`;
  }
  async signedUploadUrl(key: string, contentType: string) {
    return { url: `memory://${key}`, headers: { 'content-type': contentType } };
  }
}

function makeProviders(): AiProviders {
  return {
    lyrics: new LocalLyricsProvider(),
    music: new LocalMusicProvider(),
    separator: new LocalStemSeparator(),
    trainer: new LocalVoiceTrainer(),
    converter: new LocalVoiceConverter(),
    analyzer: new AudioQualityAnalyzer(),
    mixer: new LocalMixer(),
    mastering: new LocalMasteringProvider(),
    encoder: new PureJsEncoder(),
  };
}

const REQUEST = {
  userId: 'user-1',
  versionId: 'version-1',
  prompt: 'algo con energía',
  genre: 'pop' as const,
  language: 'es' as const,
  structure: 'verse-chorus' as const,
  timbre: 'natural' as const,
  bpm: 110,
  durationSeconds: 10,
  instrumental: false,
  voice: { handle: { provider: 'local', modelId: 'v1' }, isLowRegister: true },
};

describe('reanudación tras fallo', () => {
  it('adjunta al error los artefactos ya producidos', async () => {
    const storage = new MemoryStorage();
    const providers = makeProviders();

    // La masterización cae: para entonces la composición ya está guardada.
    const failing: AiProviders = {
      ...providers,
      mastering: {
        name: 'failing',
        master: async () => {
          throw new ProviderHttpError(503, 'servicio no disponible', 'test');
        },
      },
    };

    const error = await generateSong(REQUEST, {
      providers: failing,
      storage,
      onStage: () => {},
    }).then(
      () => null,
      (caught: unknown) => caught as ResumableError,
    );

    assert.ok(error, 'debía fallar');

    // Se leen los artefactos antes de estrechar el tipo con `instanceof`.
    const artifacts = error.artifacts;

    assert.ok(error instanceof JobError);
    assert.equal(error.code, 'provider_unavailable');
    assert.equal(error.retryable, true);

    assert.ok(artifacts, 'el error debe arrastrar los artefactos');
    assert.ok(artifacts.mix, 'la mezcla ya compuesta debe estar anotada');
    assert.ok(artifacts.mixed, 'la mezcla final ya debe estar anotada');
  });

  it('el reintento no recompone: reutiliza lo guardado', async () => {
    const storage = new MemoryStorage();
    const providers = makeProviders();

    const failing: AiProviders = {
      ...providers,
      mastering: {
        name: 'failing',
        master: async () => {
          throw new ProviderHttpError(503, 'servicio no disponible', 'test');
        },
      },
    };

    const error = (await generateSong(REQUEST, {
      providers: failing,
      storage,
      onStage: () => {},
    }).catch((caught: unknown) => caught)) as ResumableError;

    const artifacts = error.artifacts as Artifacts;

    // Segundo intento con la masterización sana y contando composiciones.
    let composeCalls = 0;
    let convertCalls = 0;

    const retryProviders: AiProviders = {
      ...providers,
      music: {
        name: 'counting',
        compose: async (...args) => {
          composeCalls += 1;
          return providers.music.compose(...args);
        },
      },
      converter: {
        name: 'counting',
        convert: async (...args) => {
          convertCalls += 1;
          return providers.converter.convert(...args);
        },
      },
    };

    const result = await generateSong(REQUEST, {
      providers: retryProviders,
      storage,
      artifacts,
      onStage: () => {},
    });

    assert.equal(composeCalls, 0, 'no debe volver a componer la canción');
    assert.equal(convertCalls, 0, 'no debe volver a convertir la voz');
    assert.ok(storage.objects.has(result.mp3Key), 'el reintento debe producir el MP3');
  });

  it('un fallo permanente se marca como no reintentable', async () => {
    const storage = new MemoryStorage();
    const providers = makeProviders();

    const failing: AiProviders = {
      ...providers,
      music: {
        name: 'failing',
        compose: async () => {
          throw new ProviderHttpError(400, 'prompt inválido', 'test');
        },
      },
    };

    const error = (await generateSong(REQUEST, {
      providers: failing,
      storage,
      onStage: () => {},
    }).catch((caught: unknown) => caught)) as JobError;

    assert.equal(error.code, 'provider_rejected');
    assert.equal(error.retryable, false, 'un 4xx no mejora reintentando');
  });

  it('la cancelación se propaga sin convertirse en JobError', async () => {
    const storage = new MemoryStorage();
    const controller = new AbortController();
    controller.abort();

    const error = (await generateSong(REQUEST, {
      providers: makeProviders(),
      storage,
      signal: controller.signal,
      onStage: () => {},
    }).catch((caught: unknown) => caught)) as Error;

    assert.ok(!(error instanceof JobError), 'cancelar no es un fallo del sistema');
  });
});
