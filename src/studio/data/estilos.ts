import type { Pattern } from "@/studio/types";
import { emptyPattern } from "@/studio/types";

/**
 * Estilos: el ritmo, el tempo y el flow de un genero, en un toque.
 *
 * Son patrones de genero, no imitaciones de ningun artista. Un dembow es un
 * dembow lo toque quien lo toque —igual que un blues de doce compases— y eso es
 * lo que se puede repartir. Clonar la voz de alguien o rehacer sus canciones no
 * entra aqui: la voz de este estudio es la tuya.
 */

export interface Estilo {
  id: string;
  nombre: string;
  /** Que se oye, en una linea. */
  descripcion: string;
  bpm: number;
  swing: number;
  /** Nota del 808, en MIDI. */
  subMidi: number;
  /** Plantilla de flow que se le impone a la voz al cuadrarla. */
  flowTemplateId: string;
  /** Pasos encendidos por voz, sobre una rejilla de 16 semicorcheas. */
  golpes: Partial<Record<keyof Pattern, number[]>>;
}

export const ESTILOS: Estilo[] = [
  {
    id: "dembow",
    nombre: "Reggaetón",
    descripcion: "El dembow de toda la vida: caja a contratiempo y cadera antes que cabeza.",
    bpm: 92,
    swing: 0,
    subMidi: 26,
    flowTemplateId: "dembow",
    golpes: {
      kick: [0, 6, 8, 14],
      snare: [3, 6, 11, 14],
      hat: [0, 2, 4, 6, 8, 10, 12, 14],
      sub: [0, 8],
    },
  },
  {
    id: "trap",
    nombre: "Trap",
    descripcion: "Caja sola en el tres, hats picados y el 808 mandando abajo.",
    bpm: 140,
    swing: 0,
    subMidi: 24,
    flowTemplateId: "tresillo",
    golpes: {
      kick: [0, 6, 10],
      snare: [8],
      hat: [0, 2, 4, 6, 7, 8, 10, 12, 14, 15],
      sub: [0, 6, 10],
    },
  },
  {
    id: "drill",
    nombre: "Drill",
    descripcion: "Bombo desplazado y 808 deslizante. Oscuro y con el pulso torcido.",
    bpm: 142,
    swing: 0.12,
    subMidi: 23,
    flowTemplateId: "tresillo",
    golpes: {
      kick: [0, 5, 10],
      snare: [8],
      hat: [0, 3, 6, 9, 12, 15],
      sub: [0, 5, 10],
    },
  },
  {
    id: "boombap",
    nombre: "Boom bap",
    descripcion: "Bombo y caja secos, corcheas limpias. Todo el peso en la letra.",
    bpm: 90,
    swing: 0.18,
    subMidi: 28,
    flowTemplateId: "boombap",
    golpes: {
      kick: [0, 10],
      snare: [4, 12],
      hat: [0, 2, 4, 6, 8, 10, 12, 14],
    },
  },
  {
    id: "afro",
    nombre: "Afrobeat",
    descripcion: "Palmas en el dos y el cuatro, bombo en tresillo. Suena a verano.",
    bpm: 105,
    swing: 0.08,
    subMidi: 26,
    flowTemplateId: "dembow",
    golpes: {
      kick: [0, 6, 10],
      clap: [4, 12],
      hat: [2, 6, 10, 14],
      openhat: [7],
      sub: [0, 10],
    },
  },
  {
    id: "melodico",
    nombre: "Melódico",
    descripcion: "Lento y espaciado, para cantar más que para rapear.",
    bpm: 78,
    swing: 0,
    subMidi: 29,
    flowTemplateId: "recto",
    golpes: {
      kick: [0, 10],
      clap: [8],
      hat: [0, 4, 8, 12],
      sub: [0, 10],
    },
  },
];

/** Convierte los pasos de un estilo en un patron del largo que toque. */
export function patronDeEstilo(estilo: Estilo, pasosPorCompas: number, compases: number): Pattern {
  const total = pasosPorCompas * compases;
  const patron = emptyPattern(total);
  for (const [voz, pasos] of Object.entries(estilo.golpes)) {
    for (let compas = 0; compas < compases; compas++) {
      for (const paso of pasos ?? []) {
        const indice = compas * pasosPorCompas + paso;
        if (indice < total) patron[voz as keyof Pattern][indice] = 0.9;
      }
    }
  }
  return patron;
}
