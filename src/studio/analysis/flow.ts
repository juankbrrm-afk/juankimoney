import type { Onset } from "./onsets";

export interface FlowMarker {
  /** Segundos desde el compas 1 del tema. */
  songTime: number;
  step: number;
  deviationMs: number;
  strength: number;
}

export interface FlowReport {
  markers: FlowMarker[];
  /** % de silabas dentro de +-30 ms de la rejilla. */
  pocket: number;
  /** Desvio mediano con signo: negativo = vas por delante del beat. */
  pushPullMs: number;
  /** Dispersion del timing: cuanto baila cada golpe. */
  spreadMs: number;
  syllablesPerBar: number;
  /** Reparto de ataques por paso dentro del compas (0..1). */
  gridHistogram: number[];
  /** % de ataques que caen en semicorchea impar (contratiempo). */
  offbeatRatio: number;
  verdict: string;
  tips: string[];
}

export interface FlowOptions {
  bpm: number;
  stepsPerBar: number;
  /** Desfase de la toma respecto al compas 1 del tema, en segundos. */
  takeOffset: number;
  /** Compensacion de latencia a restar, en milisegundos. */
  latencyMs?: number;
}

function median(values: number[]): number {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = sorted.length >> 1;
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/**
 * Compara los ataques de una toma vocal con la rejilla del tema: donde cae cada
 * silaba, cuanto se adelanta o se retrasa, y que forma tiene el flow.
 */
export function analyzeFlow(
  onsets: Onset[],
  duration: number,
  { bpm, stepsPerBar, takeOffset, latencyMs = 0 }: FlowOptions
): FlowReport {
  const stepSeconds = (60 / bpm / stepsPerBar) * 4;
  const gridHistogram = new Array(stepsPerBar).fill(0);
  const markers: FlowMarker[] = [];
  const deviations: number[] = [];

  for (const onset of onsets) {
    const songTime = takeOffset + onset.time - latencyMs / 1000;
    const exact = songTime / stepSeconds;
    const nearest = Math.round(exact);
    const deviationMs = (exact - nearest) * stepSeconds * 1000;
    const step = ((nearest % stepsPerBar) + stepsPerBar) % stepsPerBar;
    gridHistogram[step] += onset.strength;
    deviations.push(deviationMs);
    markers.push({ songTime, step, deviationMs, strength: onset.strength });
  }

  const maxBin = Math.max(1e-6, ...gridHistogram);
  for (let i = 0; i < gridHistogram.length; i++) gridHistogram[i] /= maxBin;

  const inPocket = deviations.filter((d) => Math.abs(d) <= 30).length;
  const pocket = deviations.length ? inPocket / deviations.length : 0;
  const pushPullMs = median(deviations);
  const meanAbs = deviations.length
    ? deviations.reduce((sum, d) => sum + Math.abs(d), 0) / deviations.length
    : 0;
  const bars = Math.max(1, duration / (stepSeconds * stepsPerBar));
  const syllablesPerBar = markers.length / bars;
  const offbeat = markers.filter((m) => m.step % 2 === 1).length;
  const offbeatRatio = markers.length ? offbeat / markers.length : 0;

  const tips: string[] = [];
  let verdict: string;
  if (!markers.length) {
    verdict = "No se detectaron silabas: sube el nivel del micro o acercate mas.";
  } else if (pocket >= 0.8) {
    verdict = "Flow encajado. Vas dentro del pocket casi todo el rato.";
  } else if (pocket >= 0.55) {
    verdict = "Flow decente, pero se te escapan silabas de la rejilla.";
  } else {
    verdict = "El flow va suelto respecto al beat: toca apretar el timing.";
  }

  if (pushPullMs < -18) {
    tips.push(
      `Te adelantas ${Math.abs(Math.round(pushPullMs))} ms de media. Deja que el bombo caiga antes de soltar la silaba.`
    );
  } else if (pushPullMs > 18) {
    tips.push(
      `Vas ${Math.round(pushPullMs)} ms por detras. Entra un pelin antes o baja la densidad de silabas.`
    );
  } else if (markers.length) {
    tips.push("Tu centro de gravedad esta justo sobre el beat. Ahi es.");
  }

  if (meanAbs > 45) {
    tips.push("El timing baila mucho de silaba a silaba: prueba a grabar el mismo verso a media velocidad y subir el tempo poco a poco.");
  }
  if (offbeatRatio > 0.45) {
    tips.push(
      `El ${Math.round(offbeatRatio * 100)}% de tus silabas cae a contratiempo: flow sincopado, funciona si la caja esta clara. Si no lo buscabas, mueve la toma una semicorchea con el ajuste.`
    );
  } else if (offbeatRatio < 0.15 && markers.length > 8) {
    tips.push("Casi todo cae en tiempos rectos. Mete alguna silaba en la semicorchea de en medio para que respire.");
  }
  if (syllablesPerBar > 22) {
    tips.push(`Vas a ${syllablesPerBar.toFixed(1)} silabas por compas: es doble tiempo, cuida la diccion.`);
  } else if (syllablesPerBar > 0 && syllablesPerBar < 6) {
    tips.push("Flow muy espaciado: cabe mas letra por compas si quieres llenar.");
  }

  return {
    markers,
    pocket,
    pushPullMs,
    spreadMs: meanAbs,
    syllablesPerBar,
    gridHistogram,
    offbeatRatio,
    verdict,
    tips,
  };
}
