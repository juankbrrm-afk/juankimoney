import type { Onset } from "@/studio/analysis/onsets";
import type { FlowTemplate } from "@/studio/lyrics/flowMap";

/**
 * Cuadrar la voz al beat.
 *
 * La toma se corta por los ataques —cada silaba empieza en uno— y cada trozo se
 * mueve a su sitio en la rejilla. No se cambia el tono ni la velocidad de nadie:
 * solo se recolocan los trozos, que es lo que hace un DAW cuando cuantizas
 * audio. Los cortes llevan un desvanecido de unos milisegundos para que no
 * suenen chasquidos al pegarlos.
 */

export type QuantizeMode = "rejilla" | "flow";

export interface QuantizeVocalOptions {
  bpm: number;
  stepsPerBar: number;
  /** Desfase de la toma respecto al compas 1, en segundos. */
  takeOffset: number;
  /** 0 = no toca nada, 1 = clava todo en la rejilla. */
  strength: number;
  mode: QuantizeMode;
  /** Solo en modo "flow": los pasos permitidos dentro del compas. */
  template?: FlowTemplate;
}

export interface QuantizeVocalResult {
  buffer: AudioBuffer;
  /** Cuanto se ha movido cada silaba, en ms. */
  moves: number[];
  movedMs: number;
}

const PRE_ROLL = 0.014; // Un pelin antes del ataque, para no cortarle la consonante.
const FADE = 0.005;

/**
 * En modo "flow" las silabas no van al hueco mas cercano sino a los huecos del
 * patron, uno detras de otro. Eso es lo que impone un flow de verdad: no
 * corrige lo que cantaste, lo redistribuye.
 */
function flowTargets(
  count: number,
  template: FlowTemplate,
  stepSeconds: number,
  stepsPerBar: number,
  firstStep: number
): number[] {
  const slots = template.steps;
  // El patron se ancla al compas, no a la primera silaba: un tresillo tiene que
  // caer donde cae el tresillo. Se entra por el primer hueco libre a partir de
  // donde empezaste, para respetar una anacrusa.
  const firstBar = Math.floor(firstStep / stepsPerBar);
  let slot = slots.findIndex((step) => firstBar * stepsPerBar + step >= firstStep);
  let bar = firstBar;
  if (slot < 0) {
    bar = firstBar + 1;
    slot = 0;
  }
  const targets: number[] = [];
  for (let i = 0; i < count; i++) {
    const index = slot + i;
    const at = bar + Math.floor(index / slots.length);
    targets.push((at * stepsPerBar + slots[index % slots.length]) * stepSeconds);
  }
  return targets;
}

export function quantizeVocal(
  ctx: BaseAudioContext,
  buffer: AudioBuffer,
  onsets: Onset[],
  { bpm, stepsPerBar, takeOffset, strength, mode, template }: QuantizeVocalOptions
): QuantizeVocalResult | null {
  if (!onsets.length || bpm <= 0) return null;

  const sampleRate = buffer.sampleRate;
  const stepSeconds = ((60 / bpm) * 4) / stepsPerBar;

  // Tiempos de cada ataque en el reloj del tema.
  const songTimes = onsets.map((onset) => takeOffset + onset.time);

  let targets: number[];
  if (mode === "flow" && template) {
    const firstStep = Math.max(0, Math.round(songTimes[0] / stepSeconds));
    targets = flowTargets(onsets.length, template, stepSeconds, stepsPerBar, firstStep);
    // Los objetivos estan en tiempo de cancion; el resto del calculo tambien.
  } else {
    targets = songTimes.map((time) => Math.round(time / stepSeconds) * stepSeconds);
  }

  // Desplazamiento de cada trozo, ya con la fuerza aplicada.
  const deltas = songTimes.map((time, i) => (targets[i] - time) * strength);

  // Limites de los trozos: del ataque (con su pre-roll) al siguiente.
  const bounds: number[] = [];
  for (let i = 0; i < onsets.length; i++) {
    const start = Math.max(i === 0 ? 0 : bounds[i - 1] + 0.01, onsets[i].time - PRE_ROLL);
    bounds.push(start);
  }

  let maxDelta = 0;
  for (const delta of deltas) maxDelta = Math.max(maxDelta, Math.abs(delta));
  const length = Math.ceil((buffer.duration + maxDelta + 0.2) * sampleRate);
  const out = ctx.createBuffer(1, length, sampleRate);
  const target = out.getChannelData(0);
  const source = buffer.getChannelData(0);

  const fade = Math.max(1, Math.round(FADE * sampleRate));

  /** Copia un trozo con desvanecido en los bordes y lo suma en su nuevo sitio. */
  const place = (fromSec: number, toSec: number, shiftSec: number, fadeIn: boolean, fadeOut: boolean) => {
    const from = Math.max(0, Math.round(fromSec * sampleRate));
    const to = Math.min(source.length, Math.round(toSec * sampleRate));
    if (to <= from) return;
    const shift = Math.round(shiftSec * sampleRate);
    const span = to - from;
    for (let i = 0; i < span; i++) {
      const destination = from + i + shift;
      if (destination < 0 || destination >= length) continue;
      let gain = 1;
      if (fadeIn && i < fade) gain *= i / fade;
      if (fadeOut && i > span - fade) gain *= Math.max(0, (span - i) / fade);
      target[destination] += source[from + i] * gain;
    }
  };

  // Lo que hay antes del primer ataque se queda donde estaba.
  if (bounds[0] > 0) place(0, bounds[0], 0, false, true);

  for (let i = 0; i < onsets.length; i++) {
    const from = bounds[i];
    const to = i + 1 < bounds.length ? bounds[i + 1] : buffer.duration;
    place(from, to, deltas[i], true, i + 1 < bounds.length);
  }

  // Normaliza si el solapado ha subido algun pico por encima del original.
  let outPeak = 0;
  let sourcePeak = 0;
  for (let i = 0; i < length; i++) outPeak = Math.max(outPeak, Math.abs(target[i]));
  for (let i = 0; i < source.length; i++) sourcePeak = Math.max(sourcePeak, Math.abs(source[i]));
  if (outPeak > sourcePeak && outPeak > 0) {
    const scale = sourcePeak / outPeak;
    for (let i = 0; i < length; i++) target[i] *= scale;
  }

  const moves = deltas.map((delta) => delta * 1000);
  const movedMs = moves.reduce((sum, move) => sum + Math.abs(move), 0) / Math.max(1, moves.length);

  return { buffer: out, moves, movedMs };
}
