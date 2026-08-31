import type { Estilo } from "./estilos";
import { ESTILOS } from "./estilos";

/**
 * Leer con palabras cómo quieres la canción.
 *
 * En vez de elegir de una lista, se escribe: "reggaeton lento y oscuro, con la
 * voz arrastrada". De ahí sale el género, el tempo, la densidad de sílabas y
 * cuánto se recuesta la voz. No adivina de más: lo que ha entendido se enseña
 * en pantalla para poder corregirlo escribiendo otra cosa.
 */

export interface Interpretacion {
  estilo: Estilo;
  /** Lo que se ha reconocido del texto, para enseñarlo tal cual. */
  entendido: string[];
  /** true si el texto no dijo ningún género y se ha tirado de uno por defecto. */
  porDefecto: boolean;
}

function limpiar(texto: string): string {
  return texto
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\s+/g, " ");
}

/** Géneros y todo lo que la gente escribe para referirse a ellos. */
const GENEROS: { id: string; palabras: string[] }[] = [
  { id: "perreo", palabras: ["reggaeton", "reguetton", "regueton", "perreo", "dembow", "bad bunny", "ozuna", "feid", "karol", "daddy yankee", "myke"] },
  { id: "afro", palabras: ["afro", "afrobeat", "beele", "rauw", "playa", "verano"] },
  { id: "trapmelodico", palabras: ["trap", "anuel", "bryant", "cantado duro"] },
  { id: "drill", palabras: ["drill", "duki", "uk"] },
  { id: "bachata", palabras: ["bachata", "romeo", "aventura", "prince royce"] },
  { id: "balada", palabras: ["balada", "romantica", "morat", "yatra", "pop lento", "desamor"] },
  { id: "corridos", palabras: ["corrido", "corridos", "tumbado", "tumbados", "regional", "banda", "natanael", "junior h", "peso pluma"] },
  { id: "cumbia", palabras: ["cumbia", "vallenato", "tropical"] },
  { id: "salsa", palabras: ["salsa", "timba", "son"] },
  { id: "rapmelodico", palabras: ["drake", "rap melodico", "cantado", "melodico", "rnb", "r&b"] },
  { id: "boombap", palabras: ["boom bap", "boombap", "rap clasico", "old school", "noventas", "90"] },
  { id: "doble", palabras: ["doble tiempo", "freestyle", "rapeado rapido", "muchas palabras", "denso"] },
];

const LENTO = ["lento", "lenta", "despacio", "tranquilo", "tranquila", "suave", "chill", "relajado", "relajada", "bajito"];
const RAPIDO = ["rapido", "rapida", "acelerado", "acelerada", "movido", "fiesta", "bailable", "energico", "energica"];

const ARRASTRADO = ["arrastrado", "arrastrada", "perezoso", "perezosa", "atras", "detras", "tumbado", "vago", "flojo", "relajado", "chill"];
const ENCIMA = ["clavado", "clavada", "preciso", "precisa", "marcado", "marcada", "cuadrado", "recto", "recta", "metronomo"];
const EMPUJANDO = ["agresivo", "agresiva", "duro", "dura", "fuerte", "empujando", "delante", "rabioso", "rabiosa", "cabreado"];

const MUCHAS = ["muchas palabras", "rapeado", "denso", "doble tiempo", "freestyle", "trabalenguas", "rapido cantando"];
const POCAS = ["pocas palabras", "cantado", "melodico", "melodica", "estirado", "estirada", "coro", "pegadizo"];

const OSCURO = ["oscuro", "oscura", "triste", "turbio", "turbia", "sad", "nocturno", "frio", "fria"];
const ALEGRE = ["alegre", "feliz", "verano", "fiesta", "luminoso", "luminosa", "playa"];

function contiene(texto: string, palabras: string[]): string | null {
  for (const palabra of palabras) if (texto.includes(palabra)) return palabra;
  return null;
}

/** Reparte n sílabas a lo largo del compás, lo más repartidas posible. */
function repartir(cantidad: number): number[] {
  const pasos: number[] = [];
  for (let i = 0; i < cantidad; i++) pasos.push(Math.round((i * 16) / cantidad));
  return [...new Set(pasos)].filter((p) => p < 16);
}

export function interpretar(texto: string): Interpretacion {
  const t = limpiar(texto);
  const entendido: string[] = [];

  // 1) Género. Gana la palabra que aparece antes en el texto.
  let genero = GENEROS[0];
  let porDefecto = true;
  let posicion = Infinity;
  for (const candidato of GENEROS) {
    for (const palabra of candidato.palabras) {
      const donde = t.indexOf(palabra);
      if (donde >= 0 && donde < posicion) {
        posicion = donde;
        genero = candidato;
        porDefecto = false;
      }
    }
  }
  const base = ESTILOS.find((e) => e.id === genero.id) ?? ESTILOS[0];
  entendido.push(porDefecto ? `${base.nombre} (por defecto)` : base.nombre);

  let bpm = base.bpm;
  let aire = base.flow.aire;
  let pasos = [...base.flow.pasos];
  let subMidi = base.subMidi;

  // 2) Tempo: un número manda sobre cualquier adjetivo.
  const explicito = t.match(/(\d{2,3})\s*(bpm|pulsaciones)?/);
  if (explicito && Number(explicito[1]) >= 50 && Number(explicito[1]) <= 200 && /bpm/.test(t)) {
    bpm = Number(explicito[1]);
    entendido.push(`${bpm} BPM`);
  } else if (contiene(t, LENTO)) {
    bpm = Math.round(bpm * 0.85);
    entendido.push(`lento (${bpm} BPM)`);
  } else if (contiene(t, RAPIDO)) {
    bpm = Math.round(bpm * 1.15);
    entendido.push(`rápido (${bpm} BPM)`);
  } else {
    entendido.push(`${bpm} BPM`);
  }
  bpm = Math.max(55, Math.min(190, bpm));

  // 3) Cómo se apoya la voz sobre el beat.
  if (contiene(t, EMPUJANDO)) {
    aire = Math.min(aire, 0) - 14;
    entendido.push("voz empujando por delante");
  } else if (contiene(t, ENCIMA)) {
    aire = 0;
    entendido.push("voz clavada al beat");
  } else if (contiene(t, ARRASTRADO)) {
    aire = Math.max(aire, 0) + 16;
    entendido.push(`voz arrastrada (${aire} ms por detrás)`);
  } else if (aire !== 0) {
    entendido.push(
      aire > 0 ? `voz ${aire} ms por detrás` : `voz ${Math.abs(aire)} ms por delante`
    );
  }

  // 4) Cuántas sílabas caben por compás.
  if (contiene(t, MUCHAS)) {
    pasos = repartir(16);
    entendido.push("muchas sílabas por compás");
  } else if (contiene(t, POCAS)) {
    pasos = repartir(4);
    entendido.push("pocas sílabas, estiradas");
  }

  // 5) Color.
  if (contiene(t, OSCURO)) {
    subMidi -= 3;
    entendido.push("oscuro");
  } else if (contiene(t, ALEGRE)) {
    subMidi += 2;
    entendido.push("luminoso");
  }

  return {
    estilo: {
      ...base,
      id: `${base.id}-a-medida`,
      nombre: base.nombre,
      referencia: texto.trim(),
      bpm,
      subMidi,
      flow: { pasos, aire },
    },
    entendido,
    porDefecto,
  };
}

/** Ejemplos para rellenar la caja de un toque, no una lista cerrada. */
export const EJEMPLOS = [
  "reggaeton lento y oscuro, voz arrastrada",
  "trap agresivo, muchas palabras",
  "bachata romantica, cantado",
  "corridos tumbados, tranquilo",
  "drill rapido, voz por delante",
  "balada triste, pocas palabras",
];
