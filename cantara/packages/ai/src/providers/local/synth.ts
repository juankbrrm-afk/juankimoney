/**
 * Sintetizador determinista.
 *
 * No pretende competir con un motor musical real: existe para que el
 * pipeline completo —composición, separación, conversión de voz, mezcla,
 * masterización y codificación— se pueda ejecutar y probar de principio a
 * fin sin claves de API, sin GPU y sin red. Produce audio de verdad, con
 * stems separados, así que las etapas posteriores trabajan sobre material
 * real y no sobre silencio.
 *
 * Determinista significa que la misma entrada rinde exactamente el mismo
 * audio; los tests pueden afirmar sobre el resultado.
 */

import type { Genre } from '@cantara/shared';
import { concat, fade, mixSignals, normalizePeak, type Pcm } from '../../audio/pcm.js';

const SAMPLE_RATE = 44_100;

/** PRNG xorshift32: reproducible entre plataformas, a diferencia de Math.random. */
export function createRandom(seed: number): () => number {
  let state = seed || 1;
  return () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return ((state >>> 0) % 1_000_000) / 1_000_000;
  };
}

export function hashString(input: string): number {
  let hash = 2_166_136_261;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 16_777_619);
  }
  return hash >>> 0;
}

/** Frecuencia de una nota MIDI. 69 = La4 = 440 Hz. */
export function midiToFreq(midi: number): number {
  return 440 * 2 ** ((midi - 69) / 12);
}

/** Progresiones características por familia de género. */
const PROGRESSIONS: Record<string, number[][]> = {
  minorPop: [
    [0, -3, -5, -7],
    [0, -5, -7, -3],
  ],
  majorBright: [
    [0, 4, 5, 3],
    [0, 5, 3, 4],
  ],
  urban: [
    [0, -2, -4, -2],
    [0, -4, -5, -4],
  ],
};

const GENRE_HARMONY: Record<string, { family: keyof typeof PROGRESSIONS; root: number }> = {
  pop: { family: 'majorBright', root: 60 },
  reggaeton: { family: 'urban', root: 57 },
  rock: { family: 'minorPop', root: 52 },
  electronic: { family: 'minorPop', root: 55 },
  ballad: { family: 'majorBright', root: 57 },
  rap: { family: 'urban', root: 50 },
  trap: { family: 'urban', root: 48 },
  rnb: { family: 'minorPop', root: 55 },
  indie: { family: 'majorBright', root: 59 },
  'latin-pop': { family: 'majorBright', root: 60 },
  bachata: { family: 'minorPop', root: 57 },
  cumbia: { family: 'majorBright', root: 55 },
  lofi: { family: 'minorPop', root: 53 },
  country: { family: 'majorBright', root: 57 },
};

export interface TrackSpec {
  readonly genre: Genre;
  readonly bpm: number;
  readonly durationSeconds: number;
  readonly seed: number;
}

// ── Osciladores y envolventes ────────────────────────────────

function envelope(t: number, duration: number, attack = 0.01, release = 0.15): number {
  if (t < attack) return t / attack;
  const remaining = duration - t;
  if (remaining < release) return Math.max(0, remaining / release);
  return 1;
}

function saw(phase: number): number {
  return 2 * (phase - Math.floor(phase + 0.5));
}

function square(phase: number): number {
  return Math.sin(phase * Math.PI * 2) >= 0 ? 1 : -1;
}

function renderTone(
  target: Float32Array,
  startFrame: number,
  durationSeconds: number,
  frequency: number,
  amplitude: number,
  shape: 'sine' | 'saw' | 'square',
): void {
  const frames = Math.floor(durationSeconds * SAMPLE_RATE);
  for (let i = 0; i < frames; i += 1) {
    const index = startFrame + i;
    if (index >= target.length) break;

    const t = i / SAMPLE_RATE;
    const phase = frequency * t;
    const raw =
      shape === 'sine'
        ? Math.sin(phase * Math.PI * 2)
        : shape === 'saw'
          ? saw(phase)
          : square(phase);

    target[index] = (target[index] ?? 0) + raw * amplitude * envelope(t, durationSeconds);
  }
}

function renderNoise(
  target: Float32Array,
  startFrame: number,
  durationSeconds: number,
  amplitude: number,
  random: () => number,
  decay = 30,
): void {
  const frames = Math.floor(durationSeconds * SAMPLE_RATE);
  for (let i = 0; i < frames; i += 1) {
    const index = startFrame + i;
    if (index >= target.length) break;
    const t = i / SAMPLE_RATE;
    target[index] = (target[index] ?? 0) + (random() * 2 - 1) * amplitude * Math.exp(-decay * t);
  }
}

function renderKick(target: Float32Array, startFrame: number, amplitude: number): void {
  const duration = 0.28;
  const frames = Math.floor(duration * SAMPLE_RATE);
  for (let i = 0; i < frames; i += 1) {
    const index = startFrame + i;
    if (index >= target.length) break;
    const t = i / SAMPLE_RATE;
    // Barrido de tono descendente: lo que da el "punch" de un bombo.
    const frequency = 110 * Math.exp(-18 * t) + 45;
    target[index] =
      (target[index] ?? 0) + Math.sin(2 * Math.PI * frequency * t) * amplitude * Math.exp(-9 * t);
  }
}

// ── Renderizado del instrumental ─────────────────────────────

/**
 * Instrumental completo: acordes, bajo y batería según el patrón del género.
 */
export function renderInstrumental(spec: TrackSpec): Pcm {
  const random = createRandom(spec.seed);
  const totalFrames = Math.floor(spec.durationSeconds * SAMPLE_RATE);

  const harmonyLayer = new Float32Array(totalFrames);
  const bassLayer = new Float32Array(totalFrames);
  const drumLayer = new Float32Array(totalFrames);

  const harmony = GENRE_HARMONY[spec.genre] ?? GENRE_HARMONY.pop!;
  const progressions = PROGRESSIONS[harmony.family]!;
  const beatSeconds = 60 / spec.bpm;
  const barSeconds = beatSeconds * 4;
  const bars = Math.ceil(spec.durationSeconds / barSeconds);

  const isUrban = harmony.family === 'urban';
  const isBallad = spec.genre === 'ballad' || spec.genre === 'lofi';

  for (let bar = 0; bar < bars; bar += 1) {
    const progression = progressions[Math.floor(bar / 4) % progressions.length]!;
    const degree = progression[bar % progression.length]!;
    const rootMidi = harmony.root + degree;
    const barStart = Math.floor(bar * barSeconds * SAMPLE_RATE);

    // Acorde: fundamental, tercera menor/mayor y quinta.
    const third = harmony.family === 'majorBright' ? 4 : 3;
    for (const interval of [0, third, 7]) {
      renderTone(
        harmonyLayer,
        barStart,
        barSeconds * 0.95,
        midiToFreq(rootMidi + 12 + interval),
        isBallad ? 0.13 : 0.1,
        isBallad ? 'sine' : 'saw',
      );
    }

    // Bajo: redonda en balada, corcheas sincopadas en urbano.
    if (isUrban) {
      for (const offset of [0, 0.75, 1.5, 2.5, 3]) {
        renderTone(
          bassLayer,
          barStart + Math.floor(offset * beatSeconds * SAMPLE_RATE),
          beatSeconds * 0.6,
          midiToFreq(rootMidi - 12),
          0.32,
          'sine',
        );
      }
    } else {
      renderTone(bassLayer, barStart, barSeconds * 0.9, midiToFreq(rootMidi - 12), 0.26, 'sine');
    }

    // Batería.
    for (let beat = 0; beat < 4; beat += 1) {
      const beatStart = barStart + Math.floor(beat * beatSeconds * SAMPLE_RATE);

      if (isUrban) {
        // Dembow: bombo a tiempo, caja en el contratiempo.
        renderKick(drumLayer, beatStart, 0.5);
        if (beat % 2 === 1) {
          renderNoise(drumLayer, beatStart, 0.12, 0.22, random, 45);
        }
        renderNoise(
          drumLayer,
          beatStart + Math.floor(beatSeconds * 0.75 * SAMPLE_RATE),
          0.06,
          0.12,
          random,
          70,
        );
      } else if (!isBallad) {
        if (beat === 0 || beat === 2) renderKick(drumLayer, beatStart, 0.5);
        if (beat === 1 || beat === 3) renderNoise(drumLayer, beatStart, 0.14, 0.2, random, 40);
        renderNoise(drumLayer, beatStart, 0.05, 0.07, random, 90); // charles
      } else if (beat === 0) {
        renderKick(drumLayer, beatStart, 0.32);
      }
    }
  }

  const harmonyPcm: Pcm = { channels: [harmonyLayer, harmonyLayer], sampleRate: SAMPLE_RATE };
  const bassPcm: Pcm = { channels: [bassLayer, bassLayer], sampleRate: SAMPLE_RATE };
  const drumPcm: Pcm = { channels: [drumLayer, drumLayer], sampleRate: SAMPLE_RATE };

  const combined = mixSignals(mixSignals(harmonyPcm, bassPcm), drumPcm);
  return fade(normalizePeak(combined, -6));
}

// ── Renderizado de la voz guía ───────────────────────────────

export interface VocalSpec extends TrackSpec {
  /** Una sílaba por nota. La letra define el ritmo del canto. */
  readonly syllables: readonly string[];
  /** Desplazamiento en semitonos aplicado a toda la melodía. */
  readonly pitchShift?: number;
  /** Semilla del timbre. Dos voces distintas suenan distintas. */
  readonly timbreSeed?: number;
}

/**
 * Voz cantada sintética.
 *
 * Se modela como una fundamental con armónicos y vibrato — nada que engañe a
 * nadie, pero sí una señal con la estructura de una voz: melodía, ataque por
 * sílaba y contenido armónico. Eso es lo que necesita el resto del pipeline
 * para que la separación y la conversión operen sobre algo realista.
 */
export function renderVocal(spec: VocalSpec): Pcm {
  const random = createRandom(spec.seed + 977);
  const totalFrames = Math.floor(spec.durationSeconds * SAMPLE_RATE);
  const layer = new Float32Array(totalFrames);

  const harmony = GENRE_HARMONY[spec.genre] ?? GENRE_HARMONY.pop!;
  const scale = harmony.family === 'majorBright' ? [0, 2, 4, 5, 7, 9, 11] : [0, 2, 3, 5, 7, 8, 10];
  const beatSeconds = 60 / spec.bpm;

  // El timbre desplaza el peso de los armónicos: es lo que hace que la voz
  // de un usuario suene distinta de la de otro tras la conversión.
  const timbreRandom = createRandom((spec.timbreSeed ?? spec.seed) + 31);
  const harmonicWeights = [1, 0.5 + timbreRandom() * 0.3, 0.25 + timbreRandom() * 0.25, 0.12];

  const syllables = spec.syllables.length > 0 ? spec.syllables : ['la'];
  const noteDuration = beatSeconds * 0.5;
  const notesThatFit = Math.floor(spec.durationSeconds / noteDuration);

  let scaleIndex = 0;

  for (let note = 0; note < notesThatFit; note += 1) {
    const syllable = syllables[note % syllables.length]!;

    // Las sílabas largas o acentuadas se sostienen; las cortas pasan rápido.
    const isLong = syllable.length > 3;
    const startFrame = Math.floor(note * noteDuration * SAMPLE_RATE);
    const duration = noteDuration * (isLong ? 1.6 : 0.85);

    // Camino melódico: pasos cortos, con saltos ocasionales.
    scaleIndex += random() < 0.7 ? (random() < 0.5 ? 1 : -1) : Math.round(random() * 4 - 2);
    scaleIndex = Math.max(0, Math.min(scale.length * 2 - 1, scaleIndex));

    const octave = Math.floor(scaleIndex / scale.length);
    const degree = scale[scaleIndex % scale.length]!;
    const midi = harmony.root + 12 + degree + octave * 12 + (spec.pitchShift ?? 0);
    const frequency = midiToFreq(midi);

    const frames = Math.floor(duration * SAMPLE_RATE);
    for (let i = 0; i < frames; i += 1) {
      const index = startFrame + i;
      if (index >= totalFrames) break;

      const t = i / SAMPLE_RATE;
      // Vibrato: entra progresivamente, como en el canto real.
      const vibratoDepth = Math.min(1, t / 0.35) * 0.006;
      const vibrato = 1 + Math.sin(2 * Math.PI * 5.2 * t) * vibratoDepth;

      let sample = 0;
      for (const [harmonicIndex, weight] of harmonicWeights.entries()) {
        sample += Math.sin(2 * Math.PI * frequency * vibrato * (harmonicIndex + 1) * t) * weight;
      }
      // Un poco de aire: sin componente de ruido, una voz suena a órgano.
      sample += (random() * 2 - 1) * 0.02;

      layer[index] = (layer[index] ?? 0) + sample * 0.16 * envelope(t, duration, 0.03, 0.12);
    }
  }

  return fade(normalizePeak({ channels: [layer, layer], sampleRate: SAMPLE_RATE }, -8));
}

/** Silencio del largo pedido; para pistas instrumentales. */
export function emptyVocal(durationSeconds: number): Pcm {
  const frames = Math.floor(durationSeconds * SAMPLE_RATE);
  return {
    channels: [new Float32Array(frames), new Float32Array(frames)],
    sampleRate: SAMPLE_RATE,
  };
}

export { SAMPLE_RATE, concat };
