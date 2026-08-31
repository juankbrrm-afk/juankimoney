import type { Onset } from "./onsets";
import type { DrumVoice, Pattern } from "@/studio/types";
import { emptyPattern } from "@/studio/types";

export type BeatboxVoice = Extract<DrumVoice, "kick" | "snare" | "hat">;

export interface Hit extends Onset {
  voice: BeatboxVoice;
  /** Paso de la rejilla al que se cuantiza (ya plegado al bucle). */
  step: number;
  /** Desvio respecto al paso, en milisegundos (negativo = te adelantaste). */
  deviationMs: number;
}

/** El bombo no admite discusion: es el unico golpe con el peso en los graves. */
function isKick(onset: Onset): boolean {
  return onset.low > 0.45 || onset.centroid < 900;
}

/**
 * Clasifica un golpe suelto sin mas contexto. Sirve de red de seguridad; para
 * una grabacion entera usa `classifyHits`, que se adapta a tu boca.
 */
export function classifyHit(onset: Onset): BeatboxVoice {
  if (isKick(onset)) return "kick";
  return onset.centroid > 5200 ? "hat" : "snare";
}

/**
 * Brillo de un golpe. No basta el centroide: una caja y un hi-hat pueden
 * coincidir en centroide y aun asi distinguirse porque la caja conserva cuerpo
 * en los medios y el hi-hat no tiene mas que agudos. De ahi el segundo termino.
 */
function brightness(onset: Onset): number {
  return Math.log2(Math.max(200, onset.centroid)) + 2 * (onset.high - onset.mid);
}

/**
 * Clasifica todos los golpes de una grabacion a la vez.
 *
 * El bombo se reconoce por si solo, pero el limite entre caja y hi-hat depende
 * de cada boca: lo que en una persona es un "psh" oscuro en otra es mas
 * brillante que el hi-hat del vecino. Asi que en vez de un umbral fijo se
 * separan los golpes no graves en dos grupos por su brillo (k-medias sobre el
 * logaritmo del centroide) y el grupo agudo se queda de hi-hat. Si solo hay un
 * grupo —has hecho el ritmo con un unico timbre— se cae al umbral absoluto.
 */
export function classifyHits(onsets: Onset[]): BeatboxVoice[] {
  const result: BeatboxVoice[] = onsets.map((onset) => (isKick(onset) ? "kick" : "snare"));
  const bright: number[] = [];
  for (let i = 0; i < onsets.length; i++) {
    if (result[i] !== "kick") bright.push(brightness(onsets[i]));
  }
  if (bright.length < 4) {
    for (let i = 0; i < onsets.length; i++) {
      if (result[i] !== "kick") result[i] = classifyHit(onsets[i]);
    }
    return result;
  }

  const sorted = [...bright].sort((a, b) => a - b);
  let low = sorted[Math.floor(sorted.length * 0.15)];
  let high = sorted[Math.floor(sorted.length * 0.85)];
  for (let iteration = 0; iteration < 24; iteration++) {
    let lowSum = 0;
    let lowCount = 0;
    let highSum = 0;
    let highCount = 0;
    for (const value of bright) {
      if (Math.abs(value - low) <= Math.abs(value - high)) {
        lowSum += value;
        lowCount++;
      } else {
        highSum += value;
        highCount++;
      }
    }
    if (!lowCount || !highCount) break;
    const nextLow = lowSum / lowCount;
    const nextHigh = highSum / highCount;
    if (nextLow === low && nextHigh === high) break;
    low = nextLow;
    high = nextHigh;
  }

  // Grupos demasiado juntos = un unico timbre disfrazado de dos; en ese caso
  // no inventamos una caja que no has hecho y se cae al umbral absoluto.
  const split = high - low >= 0.7 ? (low + high) / 2 : null;
  for (let i = 0; i < onsets.length; i++) {
    if (result[i] === "kick") continue;
    result[i] =
      split === null ? classifyHit(onsets[i]) : brightness(onsets[i]) > split ? "hat" : "snare";
  }
  return result;
}

export interface QuantizeOptions {
  bpm: number;
  /** Desfase del compas 1 dentro de la grabacion, en segundos. */
  offset: number;
  stepsPerBar: number;
  bars: number;
}

export interface BeatboxResult {
  pattern: Pattern;
  hits: Hit[];
  /** Vueltas completas al bucle que cubre la grabacion. */
  loops: number;
  /** Segundos hasta el "uno" elegido, ya con la rotacion aplicada. */
  downbeat: number;
}

/**
 * Elige donde empieza el compas. La deteccion de tempo solo fija la fase del
 * pulso, no cual de los cuatro es el "uno", asi que se prueban todas las
 * rotaciones y gana la que deja el bombo en el 1 y la caja en el 2 y el 4:
 * el reparto de casi cualquier ritmo popular.
 */
function findDownbeat(
  kick: Float32Array,
  snare: Float32Array,
  totalSteps: number,
  stepsPerBar: number
): number {
  const quarter = Math.max(1, Math.floor(stepsPerBar / 4));
  // Cada voz se normaliza contra su propio maximo: si no, el bombo (que pega
  // mucho mas fuerte) decide la rotacion el solo y la caja no pinta nada.
  const norm = (column: Float32Array) => {
    let max = 0;
    for (let i = 0; i < column.length; i++) if (column[i] > max) max = column[i];
    if (max <= 0) return column;
    const out = new Float32Array(column.length);
    for (let i = 0; i < column.length; i++) out[i] = column[i] / max;
    return out;
  };
  const k = norm(kick);
  const sn = norm(snare);
  const at = (column: Float32Array, index: number) => column[((index % totalSteps) + totalSteps) % totalSteps];
  let best = 0;
  let bestScore = -1;
  for (let r = 0; r < totalSteps; r++) {
    let score = 3 * at(k, r);
    for (let q = 0; q < 4; q++) score += 1.5 * at(k, r + q * quarter);
    score += 2 * (at(sn, r + quarter) + at(sn, r + 3 * quarter));
    if (score > bestScore) {
      bestScore = score;
      best = r;
    }
  }
  return best;
}

/**
 * Convierte los golpes de boca en un patron de bateria: clasifica, cuantiza a
 * la rejilla y pliega la grabacion sobre el bucle, de modo que repetir el mismo
 * ritmo varias veces refuerza los golpes buenos y descarta los sueltos.
 */
export function beatboxToPattern(
  onsets: Onset[],
  duration: number,
  { bpm, offset, stepsPerBar, bars }: QuantizeOptions
): BeatboxResult {
  const totalSteps = stepsPerBar * bars;
  const pattern = emptyPattern(totalSteps);
  const hits: Hit[] = [];
  if (!onsets.length || bpm <= 0) return { pattern, hits, loops: 0, downbeat: offset };

  const beatSeconds = 60 / bpm;
  const stepSeconds = (beatSeconds * 4) / stepsPerBar;
  const loopSeconds = stepSeconds * totalSteps;
  const loops = Math.max(1, Math.round((duration - offset) / loopSeconds));

  const weight: Record<BeatboxVoice, Float32Array> = {
    kick: new Float32Array(totalSteps),
    snare: new Float32Array(totalSteps),
    hat: new Float32Array(totalSteps),
  };

  const voices = classifyHits(onsets);

  for (const [index, onset] of onsets.entries()) {
    const relative = onset.time - offset;
    if (relative < -stepSeconds) continue;
    const exact = relative / stepSeconds;
    const nearest = Math.round(exact);
    if (nearest < 0) continue;
    const step = ((nearest % totalSteps) + totalSteps) % totalSteps;
    const voice = voices[index];
    weight[voice][step] += onset.strength;
    hits.push({
      ...onset,
      voice,
      step,
      deviationMs: (exact - nearest) * stepSeconds * 1000,
    });
  }

  const rotation = findDownbeat(weight.kick, weight.snare, totalSteps, stepsPerBar);

  for (const voice of ["kick", "snare", "hat"] as const) {
    const column = weight[voice];
    let max = 0;
    for (let i = 0; i < totalSteps; i++) if (column[i] > max) max = column[i];
    if (max <= 0) continue;
    for (let i = 0; i < totalSteps; i++) {
      const value = column[(i + rotation) % totalSteps];
      // Un golpe entra si aguanta frente al mas fuerte de su voz: filtra los
      // ruidos sueltos sin castigar los golpes flojos que si se repiten.
      if (value >= max * 0.34) {
        pattern[voice][i] = Math.min(1, 0.45 + (value / max) * 0.55);
      }
    }
  }

  for (const hit of hits) hit.step = ((hit.step - rotation) % totalSteps + totalSteps) % totalSteps;

  return { pattern, hits, loops, downbeat: offset + rotation * stepSeconds };
}
