import { measureLine, normalizeWord } from "./syllables";
import type { LineMetrics } from "./syllables";
import { rhymeScheme } from "./rhyme";

export interface LineAnalysis {
  index: number;
  text: string;
  metrics: LineMetrics;
  /** Etiqueta del esquema de rima (A, B, C...) o "-" si no rima con nadie. */
  rhymeLabel: string;
  /** Silabas tal y como se cantan (con sinalefa), listas para la rejilla. */
  syllables: string[];
}

export interface LyricsAnalysis {
  lines: LineAnalysis[];
  /** Medida de referencia: la cuenta de silabas mas repetida del bloque. */
  target: number;
  /** Palabras usadas, para alimentar el buscador de rimas con tu vocabulario. */
  vocabulary: string[];
}

export function analyzeLyrics(text: string): LyricsAnalysis {
  const rawLines = text.split("\n");
  const metrics = rawLines.map(measureLine);
  const labels = rhymeScheme(metrics.map((m) => m.lastWord));

  const lines: LineAnalysis[] = rawLines.map((line, index) => ({
    index,
    text: line,
    metrics: metrics[index],
    rhymeLabel: labels[index],
    syllables: metrics[index].metricSyllables,
  }));

  const counts = lines.filter((l) => l.metrics.count > 0).map((l) => l.metrics.count);
  const tally = new Map<number, number>();
  for (const count of counts) tally.set(count, (tally.get(count) ?? 0) + 1);
  let target = 0;
  let best = 0;
  for (const [count, times] of tally) {
    if (times > best || (times === best && count > target)) {
      best = times;
      target = count;
    }
  }

  const vocabulary = Array.from(
    new Set(lines.flatMap((l) => l.metrics.words.map(normalizeWord)).filter((w) => w.length > 2))
  );

  return { lines, target, vocabulary };
}
