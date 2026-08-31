import type { Section } from "@/studio/types";
import { measureLine } from "./syllables";
import { FLOW_TEMPLATES } from "./flowMap";

/**
 * Ordenar una letra suelta como cancion.
 *
 * Pegas el texto de un tiron y sale una estructura: que bloque es verso, cual
 * es coro, cuantos compases ocupa cada uno y en que compas entra cada frase.
 * La regla base es la del rap: un verso por compas.
 */

function normalize(line: string): string {
  return line
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9ñ ]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export interface ArrangeResult {
  sections: Section[];
  /** Que se ha hecho y por que, para poder corregirlo a mano. */
  notes: string[];
}

const CHUNK = 4;

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

function makeSection(kind: string, lines: string[], index: number): Section {
  return {
    id: `s${Date.now().toString(36)}_${index}`,
    kind,
    bars: Math.max(1, lines.length),
    lyrics: lines.join("\n"),
  };
}

export function arrangeSong(text: string): ArrangeResult {
  const lines = text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  if (!lines.length) return { sections: [], notes: ["No hay letra que ordenar."] };

  const notes: string[] = [];
  const times = new Map<string, number>();
  for (const line of lines) {
    const key = normalize(line);
    times.set(key, (times.get(key) ?? 0) + 1);
  }

  const repeated = lines.filter((line) => (times.get(normalize(line)) ?? 0) > 1);
  const sections: Section[] = [];
  let index = 0;

  if (repeated.length >= 2) {
    // Hay frases repetidas: eso es el coro, sin mas discusion.
    const blocks: { chorus: boolean; lines: string[] }[] = [];
    for (const line of lines) {
      const chorus = (times.get(normalize(line)) ?? 0) > 1;
      const last = blocks[blocks.length - 1];
      if (last && last.chorus === chorus) last.lines.push(line);
      else blocks.push({ chorus, lines: [line] });
    }
    let verse = 0;
    for (const block of blocks) {
      if (block.chorus) sections.push(makeSection("Coro", block.lines, index++));
      else sections.push(makeSection(`Verso ${++verse}`, block.lines, index++));
    }
    notes.push(
      `Hay frases que repites: esas forman el coro. Salen ${sections.filter((s) => s.kind === "Coro").length} coros y ${verse} versos.`
    );
  } else {
    // Sin repeticiones hay que decidir: se parte en bloques de cuatro y el mas
    // corto de silabas hace de coro, porque un gancho siempre pesa menos.
    const chunks = chunk(lines, CHUNK);
    if (chunks.length === 1) {
      sections.push(makeSection("Verso 1", chunks[0], index++));
      notes.push("Es un bloque corto: se queda como un solo verso.");
    } else {
      const averages = chunks.map(
        (block) => block.reduce((sum, line) => sum + measureLine(line).count, 0) / block.length
      );
      let chorusAt = 0;
      for (let i = 1; i < averages.length; i++) if (averages[i] < averages[chorusAt]) chorusAt = i;
      const chorusLines = chunks[chorusAt];

      let verse = 0;
      for (let i = 0; i < chunks.length; i++) {
        if (i === chorusAt) continue;
        sections.push(makeSection(`Verso ${++verse}`, chunks[i], index++));
        sections.push(makeSection("Coro", chorusLines, index++));
      }
      notes.push(
        `No repites ninguna frase, asi que he elegido de coro el bloque mas corto (empieza por "${chorusLines[0].slice(0, 32)}") y lo he puesto despues de cada verso.`
      );
      notes.push("Si el coro deberia ser otro bloque, cambia el tipo con el desplegable.");
    }
  }

  notes.push("Un verso por compas. Cambia los compases de cualquier bloque si quieres darle mas aire.");
  return { sections, notes };
}

/** Elige el patron de flow que mejor le cabe a un verso por su numero de silabas. */
export function suggestTemplateId(syllables: number): string {
  if (syllables <= 8) return "recto";
  if (syllables <= 12) return "boombap";
  if (syllables <= 16) return "tresillo";
  return "doble";
}

export function templateName(id: string): string {
  return FLOW_TEMPLATES.find((t) => t.id === id)?.name ?? id;
}
