import { hann, magnitudeSpectrum } from "./fft";
import { toMono } from "@/studio/audio/buffers";

export interface Onset {
  /** Segundos desde el inicio del buffer. */
  time: number;
  /** Flujo espectral normalizado (0..1) en el ataque. */
  strength: number;
  /** Centroide espectral en Hz: grave = golpe de pecho, agudo = siseo. */
  centroid: number;
  /** Reparto de energia por bandas, suman ~1. */
  low: number;
  mid: number;
  high: number;
}

export interface OnsetOptions {
  frameSize?: number;
  hopSize?: number;
  /** Cuanto tiene que superar el flujo a la mediana local para contar. */
  sensitivity?: number;
  /** Separacion minima entre golpes, en segundos. */
  minGap?: number;
}

const DEFAULTS = {
  frameSize: 1024,
  hopSize: 256,
  sensitivity: 1.6,
  minGap: 0.055,
} satisfies Required<OnsetOptions>;

/**
 * Deteccion de ataques por flujo espectral con umbral adaptativo.
 * Es la base tanto del beatbox (cada golpe = un onset) como del analisis de
 * flow (cada silaba cantada deja un ataque).
 */
export function detectOnsets(buffer: AudioBuffer, options: OnsetOptions = {}): Onset[] {
  const { frameSize, hopSize, sensitivity, minGap } = { ...DEFAULTS, ...options };
  const samples = toMono(buffer);
  const sampleRate = buffer.sampleRate;
  if (samples.length < frameSize * 2) return [];

  // Relleno de silencio delante: sin el, un ataque que empieza en el segundo 0
  // no tiene contra que comparar y se pierde. Se descuenta luego del tiempo.
  const pad = frameSize;
  const padded = new Float32Array(samples.length + pad);
  padded.set(samples, pad);

  const window = hann(frameSize);
  const frameCount = Math.floor((padded.length - frameSize) / hopSize) + 1;
  const bins = (frameSize >> 1) + 1;
  const binHz = sampleRate / frameSize;

  const flux = new Float32Array(frameCount);
  // Energias por banda sin normalizar: se promedian despues del ataque.
  const energyAll = new Float32Array(frameCount);
  const weightedHz = new Float32Array(frameCount);
  const lowBand = new Float32Array(frameCount);
  const midBand = new Float32Array(frameCount);
  const highBand = new Float32Array(frameCount);

  const frame = new Float32Array(frameSize);
  let previous = new Float32Array(bins);

  for (let f = 0; f < frameCount; f++) {
    const start = f * hopSize;
    for (let i = 0; i < frameSize; i++) frame[i] = padded[start + i] * window[i];
    const mag = magnitudeSpectrum(frame);

    let diff = 0;
    let energy = 0;
    let weighted = 0;
    let low = 0;
    let mid = 0;
    let high = 0;
    for (let k = 1; k < bins; k++) {
      const m = mag[k];
      const d = m - previous[k];
      if (d > 0) diff += d;
      energy += m;
      const hz = k * binHz;
      weighted += m * hz;
      // El corte de agudos va alto a proposito: una caja (ruido de banda ancha
      // centrado sobre los 2-5 kHz) tiene que caer en medios, no arriba con el
      // hi-hat, o los dos se confunden.
      if (hz < 250) low += m;
      else if (hz < 5000) mid += m;
      else high += m;
    }
    flux[f] = diff;
    energyAll[f] = energy;
    weightedHz[f] = weighted;
    lowBand[f] = low;
    midBand[f] = mid;
    highBand[f] = high;
    previous = mag;
  }

  let maxFlux = 0;
  for (let f = 0; f < frameCount; f++) if (flux[f] > maxFlux) maxFlux = flux[f];
  if (maxFlux <= 0) return [];

  const half = 12;
  const scratch: number[] = [];
  const onsets: Onset[] = [];
  const minGapFrames = Math.max(1, Math.round((minGap * sampleRate) / hopSize));
  let lastFrame = -minGapFrames;

  for (let f = 1; f < frameCount - 1; f++) {
    const v = flux[f];
    if (v < flux[f - 1] || v < flux[f + 1]) continue;

    scratch.length = 0;
    const from = Math.max(0, f - half);
    const to = Math.min(frameCount, f + half + 1);
    for (let i = from; i < to; i++) scratch.push(flux[i]);
    scratch.sort((a, b) => a - b);
    const median = scratch[scratch.length >> 1];
    const threshold = median * sensitivity + maxFlux * 0.035;

    if (v <= threshold) continue;
    if (f - lastFrame < minGapFrames) {
      // Dentro de la ventana muerta: nos quedamos con el golpe mas fuerte.
      const previousOnset = onsets[onsets.length - 1];
      if (previousOnset && v / maxFlux > previousOnset.strength) {
        onsets[onsets.length - 1] = makeOnset(f);
        lastFrame = f;
      }
      continue;
    }
    onsets.push(makeOnset(f));
    lastFrame = f;
  }

  return onsets;

  /**
   * El timbre no se lee en el frame del ataque —ahi todo es un chasquido de
   * banda ancha— sino en los ~35 ms siguientes, que es donde el bombo enseña su
   * grave y el hi-hat sigue siseando arriba.
   */
  function makeOnset(f: number): Onset {
    const from = Math.min(f + 1, frameCount - 1);
    const to = Math.min(f + 8, frameCount);
    let low = 0;
    let mid = 0;
    let high = 0;
    let energy = 0;
    let weighted = 0;
    for (let i = from; i < to; i++) {
      low += lowBand[i];
      mid += midBand[i];
      high += highBand[i];
      energy += energyAll[i];
      weighted += weightedHz[i];
    }
    const totalBand = low + mid + high || 1;
    return {
      time: (f * hopSize + frameSize / 2 - pad) / sampleRate,
      strength: flux[f] / maxFlux,
      centroid: energy > 0 ? weighted / energy : 0,
      low: low / totalBand,
      mid: mid / totalBand,
      high: high / totalBand,
    };
  }
}
