/**
 * Melodía: qué nota canta cada sílaba.
 *
 * Una voz hablada no tiene notas, tiene entonación suelta. Para que cante hace
 * falta decidir a qué altura va cada sílaba, y eso sale de los acordes: por
 * cada compás suena un acorde, y las sílabas de ese compás se reparten entre
 * sus notas siguiendo un dibujo que sube y baja. Es lo que separa hablar
 * encima de un beat de cantar sobre él.
 */

export type Modo = "menor" | "mayor";

export interface Armonia {
  /** Semitonos desde la tónica, un acorde por compás. Se repite en bucle. */
  acordes: number[];
  modo: Modo;
}

/** Progresiones por género. Son las que suenan en la mayoría de los temas. */
export const ARMONIAS: Record<string, Armonia> = {
  perreo: { acordes: [0, 8, 3, 10], modo: "menor" },
  afro: { acordes: [0, 10, 8, 10], modo: "menor" },
  trapmelodico: { acordes: [0, 0, 8, 10], modo: "menor" },
  drill: { acordes: [0, 8, 10, 0], modo: "menor" },
  bachata: { acordes: [0, 5, 7, 0], modo: "menor" },
  balada: { acordes: [0, 7, 9, 5], modo: "mayor" },
  corridos: { acordes: [0, 5, 7, 0], modo: "mayor" },
  cumbia: { acordes: [0, 5, 7, 7], modo: "mayor" },
  salsa: { acordes: [0, 5, 7, 0], modo: "menor" },
  rapmelodico: { acordes: [0, 8, 5, 10], modo: "menor" },
  boombap: { acordes: [0, 0, 5, 7], modo: "menor" },
  doble: { acordes: [0, 10, 8, 7], modo: "menor" },
};

export function armoniaDe(estiloId: string): Armonia {
  const base = estiloId.replace(/-a-medida$/, "");
  return ARMONIAS[base] ?? ARMONIAS.perreo;
}

/** Notas del acorde, en semitonos desde su fundamental. */
function notasDelAcorde(modo: Modo): number[] {
  return modo === "menor" ? [0, 3, 7, 12] : [0, 4, 7, 12];
}

/**
 * Dibujo de la melodía: por dónde va subiendo y bajando dentro del acorde.
 * Sube hasta la quinta y vuelve, que es la forma más cantable que hay.
 */
const DIBUJO = [0, 1, 2, 1, 2, 3, 2, 1];

export interface NotaAsignada {
  /** Índice de la sílaba dentro de la toma. */
  indice: number;
  /** Nota MIDI que debería cantar. */
  midi: number;
}

export interface MelodiaOpciones {
  /** Tónica del tema, en MIDI (la misma nota del 808, subida a la voz). */
  tonica: number;
  armonia: Armonia;
  /** Compás en el que cae cada sílaba. */
  compasPorSilaba: number[];
  /** Nota central de quien canta, para dejar la melodía en su registro. */
  centroCantante: number;
}

/**
 * Reparte una melodía sobre las sílabas y la coloca en el registro de quien
 * canta: se transporta por octavas hasta quedar donde su voz llega sin forzar,
 * porque estirar la voz muchos semitonos suena a robot.
 */
export function componerMelodia({
  tonica,
  armonia,
  compasPorSilaba,
  centroCantante,
}: MelodiaOpciones): NotaAsignada[] {
  const notas = notasDelAcorde(armonia.modo);
  const crudas: number[] = [];
  let posicionEnCompas = 0;
  let compasAnterior = -1;

  for (let i = 0; i < compasPorSilaba.length; i++) {
    const compas = compasPorSilaba[i];
    if (compas !== compasAnterior) {
      posicionEnCompas = 0;
      compasAnterior = compas;
    }
    const acorde = armonia.acordes[compas % armonia.acordes.length];
    const grado = DIBUJO[posicionEnCompas % DIBUJO.length];
    crudas.push(tonica + acorde + notas[grado]);
    posicionEnCompas++;
  }

  if (!crudas.length) return [];

  // Transporte por octavas hasta el registro del cantante.
  const ordenadas = [...crudas].sort((a, b) => a - b);
  const centroMelodia = ordenadas[ordenadas.length >> 1];
  const octavas = Math.round((centroCantante - centroMelodia) / 12);

  return crudas.map((midi, indice) => ({ indice, midi: midi + octavas * 12 }));
}
