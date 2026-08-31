/**
 * Reparto de silabas sobre la rejilla: convierte un verso escrito en un patron
 * de flow concreto (que silaba cae en que semicorchea), para poder ensayarlo
 * contra el beat antes de grabar.
 */

export interface FlowTemplate {
  id: string;
  name: string;
  description: string;
  /** Pasos preferidos dentro de un compas de 16 semicorcheas. */
  steps: number[];
}

export const FLOW_TEMPLATES: FlowTemplate[] = [
  {
    id: "recto",
    name: "Recto",
    description: "Corcheas limpias. El flow mas legible, bueno para estribillos.",
    steps: [0, 2, 4, 6, 8, 10, 12, 14],
  },
  {
    id: "boombap",
    name: "Boom bap sincopado",
    description: "Entra a tiempo y remata en la semicorchea de atras.",
    steps: [0, 3, 4, 7, 8, 11, 12, 15],
  },
  {
    id: "tresillo",
    name: "Tresillo / trap",
    description: "Grupos de tres semicorcheas: el flow que empuja hacia delante.",
    steps: [0, 3, 6, 9, 12, 15],
  },
  {
    id: "dembow",
    name: "Dembow",
    description: "Acento latino, cadera antes que cabeza.",
    steps: [0, 3, 6, 8, 11, 14],
  },
  {
    id: "doble",
    name: "Doble tiempo",
    description: "Semicorchea continua. Densidad maxima, exige diccion.",
    steps: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15],
  },
  {
    id: "arrastre",
    name: "Arrastre",
    description: "Entra tarde y se recuesta sobre la caja. Suena vago a proposito.",
    steps: [2, 4, 6, 7, 10, 12, 14, 15],
  },
];

export interface PlacedSyllable {
  syllable: string;
  /** Paso absoluto dentro del verso (puede pasar de 16 si ocupa varios compases). */
  step: number;
  /** true si cae en tiempo fuerte (1, 2, 3 o 4). */
  strong: boolean;
}

/**
 * Coloca las silabas de un verso siguiendo una plantilla de flow. Si el verso
 * tiene mas silabas que huecos, la plantilla se extiende al siguiente compas.
 */
export function placeSyllables(
  syllables: string[],
  template: FlowTemplate,
  stepsPerBar = 16
): PlacedSyllable[] {
  if (!syllables.length) return [];
  const placed: PlacedSyllable[] = [];
  const slots = template.steps;
  for (let i = 0; i < syllables.length; i++) {
    const bar = Math.floor(i / slots.length);
    const step = bar * stepsPerBar + slots[i % slots.length];
    placed.push({
      syllable: syllables[i],
      step,
      strong: step % (stepsPerBar / 4) === 0,
    });
  }
  return placed;
}

/**
 * Reparto automatico cuando no quieres plantilla: estira las silabas por el
 * compas y deja la ultima cerca del cuarto tiempo, que es donde cierra el verso.
 */
export function spreadSyllables(count: number, stepsPerBar = 16): number[] {
  if (count <= 0) return [];
  if (count === 1) return [0];
  const span = stepsPerBar - 1;
  const steps: number[] = [];
  let last = -1;
  for (let i = 0; i < count; i++) {
    const raw = Math.round((i * span) / (count - 1));
    const step = raw <= last ? last + 1 : raw;
    steps.push(step);
    last = step;
  }
  return steps;
}

/** Cuantas silabas caben por compas a un tempo dado, segun la plantilla. */
export function syllablesPerBar(template: FlowTemplate): number {
  return template.steps.length;
}

/** Segundos que dura un compas de 4/4 al tempo dado. */
export function barSeconds(bpm: number): number {
  return (60 / bpm) * 4;
}
