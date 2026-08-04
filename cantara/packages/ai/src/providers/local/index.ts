/**
 * Implementación completa de todos los puertos sin red ni claves de API.
 *
 * Es el modo por defecto en desarrollo y el que usan los tests de
 * integración. Que exista no es una comodidad: obliga a que el pipeline
 * dependa solo de los puertos, porque si algún proveedor real se colara en la
 * lógica de dominio, esta implementación no podría sustituirlo.
 */

import {
  GENRE_PROFILES,
  STRUCTURE_TEMPLATES,
  type Genre,
  type Language,
  type Lyrics,
} from '@cantara/shared';
import type {
  AudioBuffer,
  AudioMixer,
  CompositionPlan,
  CompositionResult,
  ConversionOptions,
  LyricsBrief,
  LyricsProvider,
  MasteringProvider,
  MixOptions,
  MusicProvider,
  ProviderContext,
  StemSeparator,
  Stems,
  TrainingSample,
  VoiceConverter,
  VoiceHandle,
  VoiceTrainer,
} from '../../ports.js';
import { bufferToPcm, pcmToBuffer } from '../../audio/buffer.js';
import { applyGain, mixSignals, normalizePeak, resample, toMono } from '../../audio/pcm.js';
import {
  emptyVocal,
  hashString,
  renderInstrumental,
  renderVocal,
  createRandom,
} from './synth.js';
import { LOCAL_LYRIC_BANK } from './lyric-bank.js';

/** Avanza el progreso en pasos para que las etapas largas no parezcan colgadas. */
async function tick(ctx: ProviderContext | undefined, steps: number, delayMs = 0): Promise<void> {
  for (let i = 1; i <= steps; i += 1) {
    ctx?.signal?.throwIfAborted();
    await ctx?.onProgress?.(i / steps);
    if (delayMs > 0) await new Promise((resolve) => setTimeout(resolve, delayMs));
  }
}

// ── Letras ───────────────────────────────────────────────────

export class LocalLyricsProvider implements LyricsProvider {
  readonly name = 'local';

  async generate(brief: LyricsBrief, ctx?: ProviderContext): Promise<Lyrics> {
    await tick(ctx, 3);

    const seed = hashString(`${brief.prompt}|${brief.genre}|${brief.language}`);
    const random = createRandom(seed);
    const bank = LOCAL_LYRIC_BANK[brief.language] ?? LOCAL_LYRIC_BANK.es!;
    const template = STRUCTURE_TEMPLATES[brief.structure];

    // Palabras del prompt que aportan significado: se incrustan en la letra
    // para que el resultado no sea idéntico entre prompts distintos.
    const keywords = brief.prompt
      .toLowerCase()
      .split(/[^\p{L}\p{N}]+/u)
      .filter((word) => word.length > 3)
      .slice(0, 6);

    const pick = <T,>(items: readonly T[]): T => items[Math.floor(random() * items.length)]!;

    const chorusLines = Array.from({ length: 4 }, () =>
      fill(pick(bank.chorus), keywords, pick),
    );

    const sections = template.sections.map((kind) => {
      // El estribillo se repite literalmente: es lo que lo hace estribillo.
      if (kind === 'chorus') return { kind, lines: chorusLines };

      const pool = kind === 'intro' || kind === 'outro' ? bank.short : bank.verse;
      const lineCount = kind === 'intro' || kind === 'outro' ? 2 : 4;

      return {
        kind,
        lines: Array.from({ length: lineCount }, () => fill(pick(pool), keywords, pick)),
      };
    });

    return {
      title: brief.title?.trim() || titleFrom(keywords, brief.genre, brief.language),
      language: brief.language,
      sections,
    };
  }
}

function fill(
  template: string,
  keywords: readonly string[],
  pick: <T>(items: readonly T[]) => T,
): string {
  return template.replace(/\{(\w+)\}/g, () =>
    keywords.length > 0 ? pick(keywords) : 'la noche',
  );
}

function titleFrom(keywords: readonly string[], genre: Genre, language: Language): string {
  if (keywords.length > 0) {
    const word = keywords[0]!;
    return word.charAt(0).toUpperCase() + word.slice(1);
  }
  return language === 'es' ? `Canción de ${GENRE_PROFILES[genre].label}` : GENRE_PROFILES[genre].label;
}

// ── Música ───────────────────────────────────────────────────

export class LocalMusicProvider implements MusicProvider {
  readonly name = 'local';

  async compose(plan: CompositionPlan, ctx?: ProviderContext): Promise<CompositionResult> {
    await tick(ctx, 6, 40);

    const seed = hashString(`${plan.title}|${plan.prompt}|${plan.genre}|${plan.bpm}`);
    const spec = {
      genre: plan.genre,
      bpm: plan.bpm,
      durationSeconds: plan.durationSeconds,
      seed,
    };

    const instrumental = renderInstrumental(spec);

    const vocals = plan.instrumental
      ? emptyVocal(plan.durationSeconds)
      : renderVocal({
          ...spec,
          syllables: syllablesOf(plan),
        });

    const mix = normalizePeak(mixSignals(instrumental, vocals, -1, plan.instrumental ? -60 : 0), -3);

    // Se devuelven los stems porque el motor los tiene: el pipeline detecta
    // esto y se salta la separación entera, que es exactamente lo que hará
    // con un proveedor real que también los exponga.
    return {
      mix: pcmToBuffer(mix),
      stems: {
        vocals: pcmToBuffer(vocals),
        instrumental: pcmToBuffer(instrumental),
      },
      providerTrackId: `local-${seed.toString(16)}`,
    };
  }
}

/** Sílabas de la letra: definen el ritmo del canto sintético. */
function syllablesOf(plan: CompositionPlan): string[] {
  const words = plan.sections
    .flatMap((section) => section.lines)
    .join(' ')
    .toLowerCase()
    .split(/[^\p{L}]+/u)
    .filter(Boolean);

  return words.length > 0 ? words.slice(0, 400) : ['la', 'na', 'oh'];
}

// ── Separación de stems ──────────────────────────────────────

/**
 * Separación aproximada por diferencia de banda.
 *
 * Un Demucs de verdad usa una red neuronal; aquí basta con un filtrado
 * complementario que produzca dos señales distintas y sumables. Es suficiente
 * para ejercitar el pipeline, y el adaptador real se limita a sustituir esta
 * clase.
 */
export class LocalStemSeparator implements StemSeparator {
  readonly name = 'local';

  async separate(mix: AudioBuffer, ctx?: ProviderContext): Promise<Stems> {
    await tick(ctx, 4, 30);

    const pcm = bufferToPcm(mix);
    const mono = toMono(pcm).channels[0]!;

    // La voz vive sobre todo en medios-agudos; el instrumental concentra la
    // energía en graves. Un paso alto y su complementario los reparten.
    const highPass = new Float32Array(mono.length);
    const lowPass = new Float32Array(mono.length);

    // Filtro de un polo; la constante equivale a un corte cerca de 300 Hz.
    const alpha = 0.955;
    let previousInput = 0;
    let previousHigh = 0;
    let previousLow = 0;

    for (let i = 0; i < mono.length; i += 1) {
      const input = mono[i]!;
      previousHigh = alpha * (previousHigh + input - previousInput);
      previousLow = previousLow + (1 - alpha) * (input - previousLow);
      highPass[i] = previousHigh;
      lowPass[i] = previousLow + input * 0.35;
      previousInput = input;
    }

    return {
      vocals: pcmToBuffer(
        normalizePeak({ channels: [highPass, highPass], sampleRate: pcm.sampleRate }, -8),
      ),
      instrumental: pcmToBuffer(
        normalizePeak({ channels: [lowPass, lowPass], sampleRate: pcm.sampleRate }, -6),
      ),
    };
  }
}

// ── Voz ──────────────────────────────────────────────────────

export class LocalVoiceTrainer implements VoiceTrainer {
  readonly name = 'local';
  readonly instant: boolean = false;

  async train(samples: readonly TrainingSample[], ctx?: ProviderContext): Promise<VoiceHandle> {
    // Doce pasos con espera: el entrenamiento real tarda minutos y la
    // interfaz debe poder demostrar su barra de progreso en desarrollo.
    await tick(ctx, 12, 120);

    // La huella se deriva del contenido de las muestras, así que dos
    // usuarios distintos obtienen timbres distintos y de forma reproducible.
    const fingerprint = samples
      .map((sample) => `${sample.id}:${Math.round(sample.quality.durationSeconds)}`)
      .join('|');

    return {
      provider: 'local',
      modelId: `local-voice-${hashString(fingerprint).toString(16)}`,
      meta: {
        sampleCount: samples.length,
        totalSeconds: samples.reduce((sum, s) => sum + s.quality.durationSeconds, 0),
      },
    };
  }

  async delete(): Promise<void> {
    // No hay nada externo que borrar: el modelo local es una semilla derivada.
  }
}

export class LocalVoiceConverter implements VoiceConverter {
  readonly name = 'local';

  async convert(
    vocals: AudioBuffer,
    options: ConversionOptions,
    ctx?: ProviderContext,
  ): Promise<AudioBuffer> {
    await tick(ctx, 5, 60);

    const pcm = bufferToPcm(vocals);
    const timbreSeed = hashString(options.handle.modelId);

    // La transposición se implementa como remuestreo seguido de vuelta a la
    // frecuencia original: cambia el tono y, con él, el color de la voz.
    const ratio = 2 ** (options.pitchShift / 12);
    const shifted =
      options.pitchShift === 0
        ? pcm
        : resample(
            { channels: pcm.channels, sampleRate: Math.round(pcm.sampleRate * ratio) },
            pcm.sampleRate,
          );

    // Coloreado dependiente del modelo: dos voces entrenadas distintas
    // producen resultados audiblemente distintos sobre la misma melodía.
    const random = createRandom(timbreSeed);
    const brightness = 0.6 + random() * 0.6;

    const colored = shifted.channels.map((channel) => {
      const out = new Float32Array(channel.length);
      let previous = 0;
      for (let i = 0; i < channel.length; i += 1) {
        const value = channel[i]!;
        // Realce o atenuación de agudos según la huella del modelo.
        out[i] = value + (value - previous) * (brightness - 1);
        previous = value;
      }
      return out;
    });

    const strength = options.strength ?? 0.85;
    const result = normalizePeak(
      { channels: colored, sampleRate: shifted.sampleRate },
      -8 + (1 - strength) * 3,
    );

    return pcmToBuffer(result);
  }
}

/** Variante zero-shot: sin entrenamiento, disponible al instante. */
export class LocalInstantVoiceTrainer extends LocalVoiceTrainer {
  override readonly instant = true;

  override async train(
    samples: readonly TrainingSample[],
    ctx?: ProviderContext,
  ): Promise<VoiceHandle> {
    await tick(ctx, 3, 40);
    const fingerprint = samples.map((sample) => sample.id).join('|');
    return {
      provider: 'local',
      modelId: `local-instant-${hashString(fingerprint).toString(16)}`,
      meta: { instant: true, sampleCount: samples.length },
    };
  }
}

// ── Mezcla ───────────────────────────────────────────────────

export class LocalMixer implements AudioMixer {
  readonly name = 'local';

  async mix(
    vocals: AudioBuffer,
    instrumental: AudioBuffer,
    options: MixOptions = {},
  ): Promise<AudioBuffer> {
    const vocalPcm = bufferToPcm(vocals);
    const instrumentalPcm = bufferToPcm(instrumental);

    // La voz va ligeramente por encima y el instrumental cede espacio: es la
    // relación que hace inteligible la letra en una mezcla pop.
    const mixed = mixSignals(
      vocalPcm,
      instrumentalPcm,
      options.vocalGainDb ?? 0,
      options.instrumentalGainDb ?? -3,
    );

    return pcmToBuffer(normalizePeak(mixed, -3));
  }
}

// ── Masterización ────────────────────────────────────────────

/**
 * Masterización sin dependencias: compresión suave más ajuste de sonoridad
 * al objetivo del género.
 */
export class LocalMasteringProvider implements MasteringProvider {
  readonly name = 'local';

  async master(audio: AudioBuffer, genre: Genre, ctx?: ProviderContext): Promise<AudioBuffer> {
    await tick(ctx, 3, 30);

    const pcm = bufferToPcm(audio);
    const target = GENRE_PROFILES[genre].targetLufs;

    // Compresión suave con `tanh`: eleva el nivel medio sin los artefactos
    // que produciría un recorte duro.
    const compressed = pcm.channels.map((channel) => {
      const out = new Float32Array(channel.length);
      for (let i = 0; i < channel.length; i += 1) {
        out[i] = Math.tanh(channel[i]! * 1.6) * 0.72;
      }
      return out;
    });

    // Aproximación de sonoridad: se ajusta el pico al objetivo del género
    // dejando margen de pico real.
    const headroom = Math.max(-3, target + 8);
    const mastered = normalizePeak(
      applyGain({ channels: compressed, sampleRate: pcm.sampleRate }, 0),
      headroom,
    );

    return pcmToBuffer(mastered);
  }
}
