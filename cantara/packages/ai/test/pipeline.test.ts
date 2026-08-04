/**
 * Tests de integración del pipeline completo.
 *
 * Corren contra los proveedores `local`, así que ejercitan la orquestación
 * real —composición, separación, conversión, mezcla, masterización y
 * codificación— sin red, sin claves y sin GPU. Es la garantía de que el
 * pipeline no ha acabado acoplado a ningún proveedor concreto.
 */

import assert from 'node:assert/strict';
import { describe, it, beforeEach } from 'node:test';

import { JobError, MIN_USABLE_SCORE } from '@cantara/shared';
import type { AiProviders, AudioBuffer, StoragePort } from '../src/ports.js';
import { generateSong, buildPlan, type Artifacts } from '../src/pipeline/generate-song.js';
import { trainVoice } from '../src/pipeline/train-voice.js';
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
import { pcmToBuffer, isWavBytes } from '../src/audio/buffer.js';
import { renderVocal } from '../src/providers/local/synth.js';

// ── Dobles de prueba ─────────────────────────────────────────

class MemoryStorage implements StoragePort {
  readonly objects = new Map<string, { data: Uint8Array; contentType: string }>();
  readonly writes: string[] = [];

  async put(key: string, data: Uint8Array, contentType: string): Promise<void> {
    this.objects.set(key, { data, contentType });
    this.writes.push(key);
  }

  async get(key: string): Promise<Uint8Array> {
    const found = this.objects.get(key);
    if (!found) throw new Error(`no existe: ${key}`);
    return found.data;
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

const VOICE = {
  handle: { provider: 'local', modelId: 'local-voice-test' },
  isLowRegister: true,
};

function songRequest(overrides: Partial<Parameters<typeof generateSong>[0]> = {}) {
  return {
    userId: 'user-1',
    versionId: 'version-1',
    prompt: 'una canción sobre volver a casa en verano',
    genre: 'pop' as const,
    language: 'es' as const,
    structure: 'verse-chorus' as const,
    timbre: 'natural' as const,
    bpm: 110,
    // Corta a propósito: el test debe validar orquestación, no gastar
    // segundos sintetizando audio que nadie va a escuchar.
    durationSeconds: 12,
    instrumental: false,
    voice: VOICE,
    ...overrides,
  };
}

// ── Generación ───────────────────────────────────────────────

describe('pipeline de generación', () => {
  let storage: MemoryStorage;
  let stages: string[];

  beforeEach(() => {
    storage = new MemoryStorage();
    stages = [];
  });

  const deps = () => ({
    providers: makeProviders(),
    storage,
    onStage: (stage: string, fraction: number) => {
      if (fraction === 1) stages.push(stage);
    },
  });

  it('produce MP3 y WAV recorriendo todas las etapas', async () => {
    const result = await generateSong(songRequest(), deps());

    assert.deepEqual(stages, [
      'lyrics',
      'composition',
      'separation',
      'voice-conversion',
      'mixing',
      'mastering',
      'encoding',
    ]);

    assert.ok(storage.objects.has(result.mp3Key), 'el MP3 debe existir en el almacén');
    assert.ok(storage.objects.has(result.wavKey), 'el WAV debe existir en el almacén');

    const mp3 = storage.objects.get(result.mp3Key)!;
    const wav = storage.objects.get(result.wavKey)!;

    assert.equal(mp3.contentType, 'audio/mpeg');
    assert.equal(wav.contentType, 'audio/wav');
    assert.ok(mp3.data.length > 1000, 'el MP3 no puede estar vacío');
    assert.ok(isWavBytes(wav.data), 'el WAV debe tener cabecera RIFF');
  });

  it('devuelve una onda normalizada lista para dibujar', async () => {
    const result = await generateSong(songRequest(), deps());

    assert.equal(result.waveform.length, 160);
    assert.ok(result.waveform.every((value) => value >= 0 && value <= 1));
    assert.ok(Math.max(...result.waveform) > 0.5, 'la onda no puede ser plana');
  });

  it('genera la letra cuando el usuario no la aporta', async () => {
    const result = await generateSong(songRequest(), deps());

    assert.ok(result.lyrics.sections.length > 0);
    assert.ok(result.lyrics.title.length > 0);
    assert.equal(result.lyrics.language, 'es');
  });

  it('respeta la letra del usuario en lugar de reescribirla', async () => {
    const lyrics = {
      title: 'Mi título',
      language: 'es' as const,
      sections: [{ kind: 'verse', lines: ['una línea que escribí yo'] }],
    };

    const result = await generateSong(songRequest({ lyrics }), deps());

    assert.equal(result.lyrics.title, 'Mi título');
    assert.deepEqual(result.lyrics.sections[0]!.lines, ['una línea que escribí yo']);
  });

  it('salta conversión y mezcla en una instrumental', async () => {
    const result = await generateSong(
      songRequest({ instrumental: true, voice: null }),
      deps(),
    );

    assert.ok(storage.objects.has(result.mp3Key));
    // No se convierte ninguna voz: no debe haber artefacto de conversión.
    assert.equal(result.artifacts['vocals-converted'], undefined);
  });

  it('falla con voice_not_ready si pide voz pero no hay modelo', async () => {
    await assert.rejects(
      () => generateSong(songRequest({ voice: null }), deps()),
      (error: unknown) => error instanceof JobError && error.code === 'voice_not_ready',
    );
  });

  it('reutiliza los artefactos anteriores al reanudar', async () => {
    const first = await generateSong(songRequest(), deps());

    const resumed = new MemoryStorage();
    // Se copian los artefactos del intento anterior, como haría un reintento.
    for (const [key, value] of storage.objects) resumed.objects.set(key, value);

    const artifacts: Artifacts = first.artifacts;
    const providers = makeProviders();

    let composeCalls = 0;
    const countingMusic = {
      name: 'counting',
      compose: async (...args: Parameters<typeof providers.music.compose>) => {
        composeCalls += 1;
        return providers.music.compose(...args);
      },
    };

    await generateSong(songRequest(), {
      providers: { ...providers, music: countingMusic },
      storage: resumed,
      artifacts,
      onStage: () => {},
    });

    assert.equal(composeCalls, 0, 'no debe recomponer si ya hay una mezcla guardada');
  });

  it('recompone si el artefacto anotado ya no se puede leer', async () => {
    const result = await generateSong(songRequest(), deps());

    // Se simula un artefacto perdido: la clave sigue anotada, el objeto no.
    const broken = new MemoryStorage();
    const providers = makeProviders();

    const recovered = await generateSong(songRequest(), {
      providers,
      storage: broken,
      artifacts: result.artifacts,
      onStage: () => {},
    });

    assert.ok(broken.objects.has(recovered.mp3Key), 'debe regenerar desde cero sin romperse');
  });

  it('el progreso de cada etapa nunca retrocede', async () => {
    const seen: Array<{ stage: string; fraction: number }> = [];

    await generateSong(songRequest(), {
      providers: makeProviders(),
      storage,
      onStage: (stage, fraction) => {
        const previous = seen.filter((entry) => entry.stage === stage).at(-1);
        if (previous) {
          assert.ok(
            fraction >= previous.fraction,
            `${stage} retrocedió de ${previous.fraction} a ${fraction}`,
          );
        }
        seen.push({ stage, fraction });
      },
    });

    assert.ok(seen.length > 7);
  });

  it('es determinista: la misma petición da el mismo audio', async () => {
    const a = new MemoryStorage();
    const b = new MemoryStorage();

    const first = await generateSong(songRequest(), {
      providers: makeProviders(),
      storage: a,
      onStage: () => {},
    });
    const second = await generateSong(songRequest(), {
      providers: makeProviders(),
      storage: b,
      onStage: () => {},
    });

    assert.deepEqual(first.waveform, second.waveform);
  });
});

// ── Plan de composición ──────────────────────────────────────

describe('plan de composición', () => {
  it('reparte la duración pedida entre todas las secciones', () => {
    const request = songRequest({ durationSeconds: 90, structure: 'standard' as const });
    const lyrics = { title: 'T', language: 'es' as const, sections: [] };

    const plan = buildPlan(request, lyrics);
    const total = plan.sections.reduce((sum, section) => sum + section.durationSeconds, 0);

    // Escalado proporcional, con redondeo por sección.
    assert.ok(Math.abs(total - 90) < 10, `duración total ${total} demasiado lejos de 90`);
    assert.equal(plan.sections.length, 8);
    assert.ok(plan.sections.every((section) => section.durationSeconds >= 4));
  });

  it('empareja cada sección de la letra con su hueco musical', () => {
    const request = songRequest({ structure: 'verse-chorus' as const });
    const lyrics = {
      title: 'T',
      language: 'es' as const,
      sections: [
        { kind: 'verse', lines: ['verso uno'] },
        { kind: 'chorus', lines: ['estribillo'] },
        { kind: 'verse', lines: ['verso dos'] },
      ],
    };

    const plan = buildPlan(request, lyrics);

    assert.deepEqual(plan.sections[0]!.lines, ['verso uno']);
    assert.deepEqual(plan.sections[1]!.lines, ['estribillo']);
    assert.deepEqual(plan.sections[2]!.lines, ['verso dos']);
  });
});

// ── Entrenamiento ────────────────────────────────────────────

describe('pipeline de entrenamiento de voz', () => {
  /** Muestra sintética con la calidad suficiente para pasar el filtro. */
  function goodSample(seconds: number): AudioBuffer {
    return pcmToBuffer(
      renderVocal({
        genre: 'pop',
        bpm: 100,
        durationSeconds: seconds,
        seed: 42,
        syllables: ['la', 'le', 'lo', 'ma', 'na'],
      }),
    );
  }

  it('entrena y puntúa cuando hay material suficiente', async () => {
    const storage = new MemoryStorage();
    await storage.put('s1', goodSample(70).data, 'audio/wav');
    await storage.put('s2', goodSample(70).data, 'audio/wav');

    const stages: string[] = [];

    const result = await trainVoice(
      {
        userId: 'user-1',
        voiceModelId: 'voice-1',
        instant: false,
        samples: [
          { id: 's1', storageKey: 's1', mime: 'audio/wav' },
          { id: 's2', storageKey: 's2', mime: 'audio/wav' },
        ],
      },
      {
        providers: makeProviders(),
        storage,
        onStage: (stage, fraction) => {
          if (fraction === 1) stages.push(stage);
        },
      },
    );

    assert.ok(result.handle.modelId.startsWith('local-voice-'));
    assert.ok(result.totalSeconds >= 120, `solo ${result.totalSeconds}s de material`);
    assert.ok(result.qualityScore > MIN_USABLE_SCORE);
    assert.ok(stages.includes('training'));
    assert.ok(stages.includes('finalizing'));
  });

  it('rechaza con audio_too_short si no se llegan a los 2 minutos', async () => {
    const storage = new MemoryStorage();
    await storage.put('s1', goodSample(20).data, 'audio/wav');

    await assert.rejects(
      () =>
        trainVoice(
          {
            userId: 'user-1',
            voiceModelId: 'voice-1',
            instant: false,
            samples: [{ id: 's1', storageKey: 's1', mime: 'audio/wav' }],
          },
          { providers: makeProviders(), storage, onStage: () => {} },
        ),
      (error: unknown) => error instanceof JobError && error.code === 'audio_too_short',
    );
  });

  it('rechaza con audio_unreadable si ninguna muestra se puede leer', async () => {
    await assert.rejects(
      () =>
        trainVoice(
          {
            userId: 'user-1',
            voiceModelId: 'voice-1',
            instant: false,
            samples: [{ id: 'perdida', storageKey: 'no-existe', mime: 'audio/wav' }],
          },
          { providers: makeProviders(), storage: new MemoryStorage(), onStage: () => {} },
        ),
      (error: unknown) => error instanceof JobError && error.code === 'audio_unreadable',
    );
  });

  it('firma las URLs de las muestras cuando el proveedor las necesita', async () => {
    const storage = new MemoryStorage();
    await storage.put('s1', goodSample(70).data, 'audio/wav');
    await storage.put('s2', goodSample(70).data, 'audio/wav');

    const signed: string[] = [];

    await trainVoice(
      {
        userId: 'user-1',
        voiceModelId: 'voice-1',
        instant: false,
        samples: [
          { id: 's1', storageKey: 's1', mime: 'audio/wav' },
          { id: 's2', storageKey: 's2', mime: 'audio/wav' },
        ],
      },
      {
        providers: makeProviders(),
        storage,
        onStage: () => {},
        signUrl: async (key) => {
          signed.push(key);
          return `https://signed/${key}`;
        },
      },
    );

    assert.deepEqual(signed, ['s1', 's2']);
  });
});
