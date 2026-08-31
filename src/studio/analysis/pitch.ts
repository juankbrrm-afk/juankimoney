import { toMono, rms } from "@/studio/audio/buffers";

export const NOTE_NAMES = [
  "Do",
  "Do#",
  "Re",
  "Re#",
  "Mi",
  "Fa",
  "Fa#",
  "Sol",
  "Sol#",
  "La",
  "La#",
  "Si",
] as const;

export interface PitchPoint {
  time: number;
  hz: number;
  midi: number;
  /** Desafinacion respecto a la nota temperada mas cercana, en cents. */
  cents: number;
  clarity: number;
}

export interface KeyEstimate {
  root: number;
  mode: "mayor" | "menor";
  confidence: number;
}

export interface PitchAnalysis {
  points: PitchPoint[];
  key: KeyEstimate | null;
  medianMidi: number | null;
  /** Media de |cents| en las notas sostenidas: cuanto te vas de tono. */
  averageCentsOff: number | null;
  lowestMidi: number | null;
  highestMidi: number | null;
}

export function midiToName(midi: number): string {
  const rounded = Math.round(midi);
  return `${NOTE_NAMES[((rounded % 12) + 12) % 12]}${Math.floor(rounded / 12) - 1}`;
}

export function hzToMidi(hz: number): number {
  return 69 + 12 * Math.log2(hz / 440);
}

export function midiToHz(midi: number): number {
  return 440 * 2 ** ((midi - 69) / 12);
}

/** YIN: funcion de diferencia + normalizacion acumulada + interpolacion. */
function yin(frame: Float32Array, sampleRate: number, threshold = 0.12) {
  const half = frame.length >> 1;
  const minTau = Math.max(2, Math.floor(sampleRate / 900));
  const maxTau = Math.min(half - 1, Math.floor(sampleRate / 60));
  if (maxTau <= minTau) return null;

  const diff = new Float32Array(maxTau + 1);
  for (let tau = minTau; tau <= maxTau; tau++) {
    let sum = 0;
    for (let i = 0; i < half; i++) {
      const d = frame[i] - frame[i + tau];
      sum += d * d;
    }
    diff[tau] = sum;
  }

  const cmnd = new Float32Array(maxTau + 1);
  let running = 0;
  for (let tau = minTau; tau <= maxTau; tau++) {
    running += diff[tau];
    cmnd[tau] = running > 0 ? (diff[tau] * (tau - minTau + 1)) / running : 1;
  }

  let chosen = -1;
  for (let tau = minTau + 1; tau < maxTau; tau++) {
    if (cmnd[tau] < threshold && cmnd[tau] <= cmnd[tau + 1]) {
      chosen = tau;
      break;
    }
  }
  if (chosen < 0) {
    let best = minTau;
    for (let tau = minTau; tau <= maxTau; tau++) if (cmnd[tau] < cmnd[best]) best = tau;
    if (cmnd[best] > 0.45) return null;
    chosen = best;
  }

  const a = cmnd[chosen - 1] ?? cmnd[chosen];
  const b = cmnd[chosen];
  const c = cmnd[chosen + 1] ?? cmnd[chosen];
  const denominator = a - 2 * b + c;
  const shift = denominator !== 0 ? (0.5 * (a - c)) / denominator : 0;
  const tau = chosen + Math.max(-1, Math.min(1, shift));
  return { hz: sampleRate / tau, clarity: 1 - b };
}

// Perfiles de Krumhansl-Kessler, base para adivinar la tonalidad.
const MAJOR = [6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88];
const MINOR = [6.33, 2.68, 3.52, 5.38, 2.6, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17];

function correlate(histogram: number[], profile: number[], rotation: number): number {
  const n = 12;
  let meanA = 0;
  let meanB = 0;
  for (let i = 0; i < n; i++) {
    meanA += histogram[(i + rotation) % n];
    meanB += profile[i];
  }
  meanA /= n;
  meanB /= n;
  let num = 0;
  let da = 0;
  let db = 0;
  for (let i = 0; i < n; i++) {
    const x = histogram[(i + rotation) % n] - meanA;
    const y = profile[i] - meanB;
    num += x * y;
    da += x * x;
    db += y * y;
  }
  return da > 0 && db > 0 ? num / Math.sqrt(da * db) : 0;
}

/**
 * Diezmado a ~16 kHz promediando muestras. La voz no pasa de 900 Hz, asi que
 * YIN no necesita mas banda y el analisis baja de segundos a milisegundos.
 */
function decimate(samples: Float32Array, sampleRate: number, target = 16000) {
  const factor = Math.max(1, Math.floor(sampleRate / target));
  if (factor === 1) return { samples, sampleRate };
  const length = Math.floor(samples.length / factor);
  const out = new Float32Array(length);
  for (let i = 0; i < length; i++) {
    let sum = 0;
    for (let k = 0; k < factor; k++) sum += samples[i * factor + k];
    out[i] = sum / factor;
  }
  return { samples: out, sampleRate: sampleRate / factor };
}

/**
 * Analiza el tono de una toma: nota por frame, tonalidad estimada y cuanto se
 * desvia la voz de la afinacion temperada.
 */
export function analyzePitch(buffer: AudioBuffer, frameSize = 1024, hopSize = 512): PitchAnalysis {
  const { samples, sampleRate } = decimate(toMono(buffer), buffer.sampleRate);
  const points: PitchPoint[] = [];
  const histogram = new Array(12).fill(0);

  const level = rms(samples);
  const gate = Math.max(0.012, level * 0.35);

  for (let start = 0; start + frameSize <= samples.length; start += hopSize) {
    const frame = samples.subarray(start, start + frameSize);
    if (rms(frame) < gate) continue;
    const result = yin(frame, sampleRate);
    if (!result || result.hz < 60 || result.hz > 900) continue;
    const midi = hzToMidi(result.hz);
    const cents = (midi - Math.round(midi)) * 100;
    points.push({
      time: (start + frameSize / 2) / sampleRate,
      hz: result.hz,
      midi,
      cents,
      clarity: result.clarity,
    });
    histogram[((Math.round(midi) % 12) + 12) % 12] += result.clarity;
  }

  if (!points.length) {
    return {
      points,
      key: null,
      medianMidi: null,
      averageCentsOff: null,
      lowestMidi: null,
      highestMidi: null,
    };
  }

  const sortedMidi = points.map((p) => p.midi).sort((a, b) => a - b);
  const medianMidi = sortedMidi[sortedMidi.length >> 1];
  const averageCentsOff =
    points.reduce((sum, p) => sum + Math.abs(p.cents), 0) / points.length;

  let key: KeyEstimate | null = null;
  let bestScore = -2;
  let secondScore = -2;
  for (let root = 0; root < 12; root++) {
    for (const mode of ["mayor", "menor"] as const) {
      const score = correlate(histogram, mode === "mayor" ? MAJOR : MINOR, root);
      if (score > bestScore) {
        secondScore = bestScore;
        bestScore = score;
        key = { root, mode, confidence: 0 };
      } else if (score > secondScore) {
        secondScore = score;
      }
    }
  }
  if (key) key.confidence = Math.max(0, Math.min(1, bestScore - Math.max(0, secondScore)));

  return {
    points,
    key,
    medianMidi,
    averageCentsOff,
    lowestMidi: sortedMidi[0],
    highestMidi: sortedMidi[sortedMidi.length - 1],
  };
}
