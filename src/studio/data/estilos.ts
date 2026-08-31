import type { Pattern } from "@/studio/types";
import { emptyPattern } from "@/studio/types";

/**
 * Bases de genero: el ritmo y, sobre todo, el FLOW.
 *
 * No son un menu para elegir. Son el punto de partida que `interpretar` usa
 * cuando escribes como quieres que suene: de ahi sale el patron y el flow, y
 * luego se ajustan con lo demas que hayas dicho.
 *
 * Un estilo no es solo la bateria. Lo que hace que un tema suene a un sitio o a
 * otro es donde caen las silabas y como de recostadas van: el mismo verso, con
 * la misma voz, cambia entero si lo pones sobre un tresillo arrastrado o sobre
 * corcheas rectas. Cada estilo trae las dos cosas, y el flow es el que se le
 * aplica a tu voz al cuadrarla.
 *
 * La voz que suena siempre es la de quien graba.
 */

export interface FlowEstilo {
  /** Semicorcheas del compas donde cae cada silaba. */
  pasos: number[];
  /**
   * Cuanto se recuesta la voz respecto a la rejilla, en milisegundos.
   * Positivo = va por detras (arrastrado, perezoso). Negativo = empuja.
   * Es lo que separa un flow con caida de uno de metronomo.
   */
  aire: number;
}

export interface Estilo {
  id: string;
  nombre: string;
  /** A que suena la cadencia, dicho con nombres que se reconocen. */
  referencia: string;
  descripcion: string;
  bpm: number;
  swing: number;
  /** Nota del 808, en MIDI. */
  subMidi: number;
  /** Pasos encendidos por voz, sobre una rejilla de 16 semicorcheas. */
  golpes: Partial<Record<keyof Pattern, number[]>>;
  flow: FlowEstilo;
}

export const ESTILOS: Estilo[] = [
  {
    id: "perreo",
    nombre: "Reggaetón",
    referencia: "dembow, perreo",
    descripcion:
      "Dembow pausado y la voz muy por detras del golpe. Pocas silabas, bien separadas, cayendo tarde a proposito.",
    bpm: 90,
    swing: 0,
    subMidi: 26,
    golpes: {
      kick: [0, 6, 8, 14],
      snare: [3, 6, 11, 14],
      hat: [0, 2, 4, 6, 8, 10, 12, 14],
      sub: [0, 8],
    },
    flow: { pasos: [0, 3, 6, 8, 11, 14], aire: 28 },
  },
  {
    id: "afro",
    nombre: "Afrobeat",
    referencia: "melódico, playero",
    descripcion:
      "Muy pocas silabas por compas y todas arrastradas: se canta estirando las palabras mas que marcandolas.",
    bpm: 102,
    swing: 0.08,
    subMidi: 26,
    golpes: {
      kick: [0, 6, 10],
      clap: [4, 12],
      hat: [2, 6, 10, 14],
      openhat: [7],
      sub: [0, 10],
    },
    flow: { pasos: [0, 3, 6, 10, 13], aire: 36 },
  },
  {
    id: "trapmelodico",
    nombre: "Trap",
    referencia: "808 y caja en el tres",
    descripcion: "Caja sola en el tres, hats picados y el 808 mandando abajo.",
    bpm: 140,
    swing: 0,
    subMidi: 24,
    golpes: {
      kick: [0, 6, 10],
      snare: [8],
      hat: [0, 2, 4, 6, 7, 8, 10, 12, 14, 15],
      sub: [0, 6, 10],
    },
    flow: { pasos: [0, 3, 6, 9, 12, 15], aire: 12 },
  },
  {
    id: "drill",
    nombre: "Drill",
    referencia: "bombo desplazado",
    descripcion: "Bombo desplazado, 808 deslizante y la voz empujando por delante del beat.",
    bpm: 142,
    swing: 0.12,
    subMidi: 23,
    golpes: {
      kick: [0, 5, 10],
      snare: [8],
      hat: [0, 3, 6, 9, 12, 15],
      sub: [0, 5, 10],
    },
    flow: { pasos: [0, 3, 6, 9, 12, 15], aire: -14 },
  },
  {
    id: "bachata",
    nombre: "Bachata",
    referencia: "romántica",
    descripcion:
      "Pulso de bachata: guira picada y el golpe fuerte en el cuatro. Voz recostada, frases largas.",
    bpm: 126,
    swing: 0.06,
    subMidi: 28,
    golpes: {
      kick: [0, 8],
      snare: [12],
      hat: [0, 2, 4, 6, 8, 10, 12, 14],
      openhat: [15],
      sub: [0, 8],
    },
    flow: { pasos: [0, 4, 8, 12], aire: 22 },
  },
  {
    id: "balada",
    nombre: "Balada",
    referencia: "lenta, cantada",
    descripcion: "Lenta y abierta. Cuatro sílabas por compás: aquí se canta, no se rapea.",
    bpm: 72,
    swing: 0,
    subMidi: 29,
    golpes: {
      kick: [0, 8],
      clap: [8],
      hat: [0, 4, 8, 12],
      sub: [0, 8],
    },
    flow: { pasos: [0, 4, 8, 12], aire: 15 },
  },
  {
    id: "corridos",
    nombre: "Corridos",
    referencia: "tumbado",
    descripcion:
      "El bajo marcando y la voz contando una historia. Pocas sílabas, muy por detrás del golpe.",
    bpm: 84,
    swing: 0.1,
    subMidi: 26,
    golpes: {
      kick: [0, 8],
      sub: [0, 4, 8, 12],
      hat: [4, 12],
    },
    flow: { pasos: [0, 3, 6, 8, 11, 14], aire: 32 },
  },
  {
    id: "rapmelodico",
    nombre: "Rap melódico",
    referencia: "medio tiempo, cantado a medias",
    descripcion: "Medio tiempo, cantado a medias. Cadencia relajada y muy hablada.",
    bpm: 82,
    swing: 0.05,
    subMidi: 27,
    golpes: {
      kick: [0, 6, 10],
      snare: [8],
      hat: [0, 2, 4, 6, 8, 10, 12, 14],
      sub: [0, 10],
    },
    flow: { pasos: [0, 2, 5, 8, 10, 13], aire: 20 },
  },
  {
    id: "cumbia",
    nombre: "Cumbia",
    referencia: "cumbia",
    descripcion: "Golpe en el dos y el cuatro con la guira encima. Para cantar paseando.",
    bpm: 96,
    swing: 0.1,
    subMidi: 28,
    golpes: {
      kick: [0, 8],
      snare: [4, 12],
      hat: [2, 6, 10, 14],
      sub: [0, 8],
    },
    flow: { pasos: [0, 4, 8, 12], aire: 18 },
  },
  {
    id: "salsa",
    nombre: "Salsa",
    referencia: "salsa",
    descripcion: "Clave de tres-dos y percusion picada. Frases largas encima del tumbao.",
    bpm: 180,
    swing: 0,
    subMidi: 31,
    golpes: {
      kick: [0, 8],
      clap: [0, 3, 6, 10, 12],
      hat: [0, 2, 4, 6, 8, 10, 12, 14],
      sub: [0, 6, 8, 14],
    },
    flow: { pasos: [0, 2, 4, 6, 8, 10, 12, 14], aire: 6 },
  },
  {
    id: "boombap",
    nombre: "Boom bap",
    referencia: "rap clásico",
    descripcion: "Corcheas rectas clavadas al bombo y la caja. Todo el peso en lo que dices.",
    bpm: 90,
    swing: 0.18,
    subMidi: 28,
    golpes: {
      kick: [0, 10],
      snare: [4, 12],
      hat: [0, 2, 4, 6, 8, 10, 12, 14],
    },
    flow: { pasos: [0, 2, 4, 6, 8, 10, 12, 14], aire: 0 },
  },
  {
    id: "doble",
    nombre: "Doble tiempo",
    referencia: "rápido, freestyle",
    descripcion: "Semicorchea continua y voz encima del beat. Densidad maxima, exige diccion.",
    bpm: 95,
    swing: 0,
    subMidi: 26,
    golpes: {
      kick: [0, 6, 10],
      snare: [4, 12],
      hat: [0, 2, 4, 6, 8, 10, 12, 14],
      sub: [0, 10],
    },
    flow: {
      pasos: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15],
      aire: -6,
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
