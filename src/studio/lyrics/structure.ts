/** Plantillas de estructura de cancion, en compases. */

export interface SectionTemplate {
  kind: string;
  bars: number;
  hint: string;
}

export interface SongTemplate {
  id: string;
  name: string;
  description: string;
  sections: SectionTemplate[];
}

export const SONG_TEMPLATES: SongTemplate[] = [
  {
    id: "urbano",
    name: "Urbano / trap",
    description: "Estribillo pegado al principio: engancha antes de contar nada.",
    sections: [
      { kind: "Intro", bars: 4, hint: "Ambiente, una frase suelta o el ad-lib de marca." },
      { kind: "Coro", bars: 8, hint: "La idea entera en una linea que se repita sola." },
      { kind: "Verso 1", bars: 16, hint: "Concreto: nombres, sitios, cifras. Nada de abstracciones." },
      { kind: "Coro", bars: 8, hint: "Igual que antes, sin tocar nada." },
      { kind: "Verso 2", bars: 16, hint: "Gira el punto de vista: lo mismo visto desde otro sitio." },
      { kind: "Puente", bars: 4, hint: "Quita percusion, deja la voz sola. Respira." },
      { kind: "Coro", bars: 8, hint: "Ultima vuelta, con dobles y coros arriba." },
    ],
  },
  {
    id: "boombap",
    name: "Boom bap clasico",
    description: "Versos largos, estribillo corto. El peso esta en la letra.",
    sections: [
      { kind: "Intro", bars: 8, hint: "Solo beat. Deja que entre el loop." },
      { kind: "Verso 1", bars: 16, hint: "Un tema por verso. Cierra con la frase mas fuerte." },
      { kind: "Coro", bars: 4, hint: "Cuatro compases, casi un cantado. Puede ser scratch." },
      { kind: "Verso 2", bars: 16, hint: "Sube la densidad de rima interna." },
      { kind: "Coro", bars: 4, hint: "Repite." },
      { kind: "Verso 3", bars: 16, hint: "Remate. Aqui va lo que querias decir de verdad." },
      { kind: "Outro", bars: 8, hint: "El beat se queda solo y se va." },
    ],
  },
  {
    id: "cancion",
    name: "Cancion (estrofa-estribillo)",
    description: "Estructura melodica de toda la vida, sirve para cantar sobre el beat.",
    sections: [
      { kind: "Intro", bars: 4, hint: "Motivo instrumental." },
      { kind: "Estrofa 1", bars: 8, hint: "Registro bajo, cerca del hablado." },
      { kind: "Pre-coro", bars: 4, hint: "Sube la nota y la tension: prepara la caida." },
      { kind: "Coro", bars: 8, hint: "Nota mas alta del tema y la frase titulo." },
      { kind: "Estrofa 2", bars: 8, hint: "Avanza la historia, no la repitas." },
      { kind: "Pre-coro", bars: 4, hint: "Igual que el primero." },
      { kind: "Coro", bars: 8, hint: "Repite y dobla la voz." },
      { kind: "Puente", bars: 4, hint: "Cambia de acorde o de tono." },
      { kind: "Coro", bars: 8, hint: "Final, todo arriba." },
    ],
  },
];

export const SECTION_KINDS = [
  "Intro",
  "Verso",
  "Pre-coro",
  "Coro",
  "Puente",
  "Outro",
] as const;
