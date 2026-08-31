import type { Onset } from "./onsets";

export interface TempoEstimate {
  bpm: number;
  /** 0..1 — cuanto destaca el pulso ganador frente al resto. */
  confidence: number;
  /** Segundos hasta el primer pulso fuerte detectado. */
  offset: number;
}

const ENVELOPE_HZ = 200;
const MIN_BPM = 60;
const MAX_BPM = 190;

/** Envolvente de ataques: un impulso suavizado por golpe, pesado por su fuerza. */
function onsetEnvelope(onsets: Onset[], duration: number): Float32Array {
  const length = Math.max(1, Math.ceil(duration * ENVELOPE_HZ));
  const env = new Float32Array(length);
  for (const onset of onsets) {
    const center = Math.round(onset.time * ENVELOPE_HZ);
    for (let d = -2; d <= 2; d++) {
      const i = center + d;
      if (i < 0 || i >= length) continue;
      env[i] += onset.strength * Math.exp(-(d * d) / 2);
    }
  }
  return env;
}

/**
 * Estima el tempo a partir de los golpes: autocorrelacion de la envolvente de
 * ataques con una preferencia log-normal alrededor de 110 BPM (asi no se va al
 * doble ni a la mitad tan facilmente).
 */
export function estimateTempo(onsets: Onset[], duration: number): TempoEstimate | null {
  if (onsets.length < 4 || duration <= 0) return null;
  const env = onsetEnvelope(onsets, duration);
  const minLag = Math.floor((60 / MAX_BPM) * ENVELOPE_HZ);
  const maxLag = Math.ceil((60 / MIN_BPM) * ENVELOPE_HZ);
  if (env.length <= maxLag + 4) return null;

  // Autocorrelacion hasta cuatro pulsos: hace falta para el peine de abajo.
  const maxProbe = Math.min(env.length - 2, maxLag * 4);
  const ac = new Float32Array(maxProbe + 1);
  for (let lag = minLag; lag <= maxProbe; lag++) {
    let sum = 0;
    for (let i = 0; i + lag < env.length; i++) sum += env[i] * env[i + lag];
    ac[lag] = sum / (env.length - lag);
  }

  // Peine de armonicos: un pulso de verdad se repite tambien a dos, tres y
  // cuatro veces su periodo. Puntuar solo el lag suelto hace que el estimador
  // se enganche a la subdivision (la corchea, el tresillo) en ritmos
  // sincopados; sumar los multiplos deja ganar al compas.
  const weights = [1, 0.55, 0.35, 0.3];
  const scores: { lag: number; score: number }[] = [];
  for (let lag = minLag; lag <= maxLag; lag++) {
    let sum = 0;
    let used = 0;
    for (let m = 0; m < weights.length; m++) {
      const probe = lag * (m + 1);
      if (probe > maxProbe) break;
      sum += weights[m] * ac[probe];
      used += weights[m];
    }
    if (used <= 0) continue;
    const bpm = (60 * ENVELOPE_HZ) / lag;
    const bias = Math.exp(-0.5 * (Math.log2(bpm / 110) / 0.9) ** 2);
    scores.push({ lag, score: (sum / used) * bias });
  }
  scores.sort((a, b) => b.score - a.score);
  const best = scores[0];
  if (!best || best.score <= 0) return null;

  // Refinado: promedio ponderado de los lags vecinos al pico.
  let num = 0;
  let den = 0;
  for (const candidate of scores) {
    if (Math.abs(candidate.lag - best.lag) > 2) continue;
    num += candidate.lag * candidate.score;
    den += candidate.score;
  }
  const lag = den > 0 ? num / den : best.lag;
  const period = lag / ENVELOPE_HZ;

  // Un pulso al doble o a la mitad no es un rival: es el mismo tempo contado de
  // otra forma. Solo cuenta como competencia un lag que no sea armonico.
  const harmonics = [1 / 3, 1 / 2, 2 / 3, 1, 3 / 2, 2, 3];
  const runnerUp = scores.find((candidate) => {
    const ratio = candidate.lag / lag;
    return !harmonics.some((h) => Math.abs(ratio - h) < h * 0.07);
  });
  const confidence = runnerUp ? Math.max(0, 1 - runnerUp.score / best.score) : 1;

  return {
    bpm: Math.round(((60 * ENVELOPE_HZ) / lag) * 10) / 10,
    confidence: Math.min(1, confidence),
    offset: findPhase(onsets, period, duration),
  };
}

/**
 * Busca el desfase del primer pulso: prueba offsets dentro de un periodo y se
 * queda con el que mas golpes fuertes atrapa sobre la rejilla.
 */
export function findPhase(onsets: Onset[], beatSeconds: number, duration: number): number {
  if (beatSeconds <= 0) return 0;
  const steps = 120;
  let bestOffset = 0;
  let bestScore = -1;
  for (let s = 0; s < steps; s++) {
    const offset = (s / steps) * beatSeconds;
    let score = 0;
    for (const onset of onsets) {
      if (onset.time < offset) continue;
      const position = (onset.time - offset) / beatSeconds;
      const distance = Math.abs(position - Math.round(position));
      score += onset.strength * Math.exp(-(distance ** 2) / 0.02);
    }
    if (score > bestScore) {
      bestScore = score;
      bestOffset = offset;
    }
  }
  // Retrocede al primer pulso dentro de la grabacion.
  while (bestOffset - beatSeconds > 0) bestOffset -= beatSeconds;
  return bestOffset < duration ? bestOffset : 0;
}
