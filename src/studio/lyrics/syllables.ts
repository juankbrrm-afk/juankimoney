/**
 * Silabeo y acentuacion del castellano. Es la base de todo el asistente de
 * letra: contar silabas por verso, saber donde cae la tonica y, a partir de
 * ahi, encontrar rimas y repartir la letra sobre la rejilla.
 */

const VOWELS = "aeiouáéíóúüàèìòù";
const STRONG = "aeoáéóàèò";
const ACCENTED_WEAK = "íúì";
const INSEPARABLE = new Set([
  "ch",
  "ll",
  "rr",
  "pr",
  "br",
  "tr",
  "dr",
  "cr",
  "gr",
  "fr",
  "pl",
  "bl",
  "cl",
  "gl",
  "fl",
]);

export function normalizeWord(word: string): string {
  return word
    .toLowerCase()
    .replace(/[’']/g, "")
    .replace(/[^a-záéíóúüñàèìòù]/g, "");
}

function isVowelChar(c: string): boolean {
  return VOWELS.includes(c);
}

/** La 'y' suena a vocal cuando no arrastra otra vocal detras (rey, y, hoy). */
function isVowelAt(chars: string[], i: number): boolean {
  const c = chars[i];
  if (isVowelChar(c)) return true;
  if (c !== "y") return false;
  const next = chars[i + 1];
  return next === undefined || !isVowelChar(next);
}

/** La 'y' vocalica suena como una 'i': es debil, forma diptongo (rey, hoy, muy). */
function isStrong(c: string): boolean {
  return STRONG.includes(c);
}

function isAccentedWeak(c: string): boolean {
  return ACCENTED_WEAK.includes(c);
}

/** Divide una palabra en silabas. Devuelve [] si no queda nada silabable. */
export function syllabify(rawWord: string): string[] {
  const word = normalizeWord(rawWord);
  if (!word) return [];
  const chars = [...word];

  // 1) Nucleos vocalicos, partiendo diptongos falsos (hiatos).
  const nuclei: { start: number; end: number }[] = [];
  let i = 0;
  while (i < chars.length) {
    if (!isVowelAt(chars, i)) {
      i++;
      continue;
    }
    let start = i;
    let count = 1;
    let j = i + 1;
    while (j < chars.length && isVowelAt(chars, j)) {
      const previous = chars[j - 1];
      const current = chars[j];
      const hiatus =
        (isStrong(previous) && isStrong(current)) ||
        isAccentedWeak(previous) ||
        isAccentedWeak(current) ||
        previous === current ||
        count >= 3;
      if (hiatus) {
        nuclei.push({ start, end: j });
        start = j;
        count = 1;
      } else {
        count++;
      }
      j++;
    }
    nuclei.push({ start, end: j });
    i = j;
  }

  if (!nuclei.length) return [word];

  // 2) Reparto de las consonantes que quedan entre nucleo y nucleo.
  const cuts: number[] = [];
  for (let n = 0; n < nuclei.length - 1; n++) {
    const a = nuclei[n].end;
    const b = nuclei[n + 1].start;
    const cluster = chars.slice(a, b).join("");
    let cut: number;
    if (cluster.length === 0) cut = b;
    else if (cluster.length === 1) cut = a;
    else if (cluster.length === 2) cut = INSEPARABLE.has(cluster) ? a : a + 1;
    else if (cluster.length === 3) cut = INSEPARABLE.has(cluster.slice(1)) ? a + 1 : a + 2;
    else cut = a + 2;
    cuts.push(cut);
  }

  const syllables: string[] = [];
  let from = 0;
  for (const cut of cuts) {
    syllables.push(chars.slice(from, cut).join(""));
    from = cut;
  }
  syllables.push(chars.slice(from).join(""));
  return syllables.filter(Boolean);
}

/** Indice (0-based) de la silaba tonica. */
export function stressIndex(word: string): number {
  const syllables = syllabify(word);
  if (syllables.length <= 1) return 0;
  for (let i = 0; i < syllables.length; i++) {
    if (/[áéíóúàèìò]/.test(syllables[i])) return i;
  }
  const normalized = normalizeWord(word);
  const last = normalized[normalized.length - 1];
  return "aeiouns".includes(last) ? syllables.length - 2 : syllables.length - 1;
}

export type Accentuation = "aguda" | "llana" | "esdrujula";

export function accentuation(word: string): Accentuation {
  const syllables = syllabify(word);
  const fromEnd = syllables.length - 1 - stressIndex(word);
  if (fromEnd === 0) return "aguda";
  if (fromEnd === 1) return "llana";
  return "esdrujula";
}

export function splitWords(line: string): string[] {
  return line.split(/[^a-zA-ZáéíóúüñÁÉÍÓÚÜÑ'’]+/).filter(Boolean);
}

export interface LineMetrics {
  words: string[];
  /** Silabas de cada palabra, ya divididas. */
  syllablesByWord: string[][];
  /** Suma cruda de silabas, sin sinalefa. */
  rawCount: number;
  /** Cuenta metrica: aplica sinalefa entre palabras. */
  count: number;
  /** Numero de sinalefas encontradas. */
  sinalefas: number;
  /**
   * Las silabas tal y como se cantan: las que se unen por sinalefa van juntas
   * en una sola casilla, unidas por el signo de union. Es la lista que hay que
   * repartir sobre la rejilla, porque cada casilla es un golpe de voz.
   */
  metricSyllables: string[];
  lastWord: string | null;
}

/** Sinalefa: vocal final + vocal (o h + vocal) inicial se cantan de un tiron. */
function joinsWithNext(previous: string, next: string): boolean {
  const a = normalizeWord(previous);
  const b = normalizeWord(next);
  if (!a || !b) return false;
  const lastChar = a[a.length - 1];
  // La 'h' es muda: "la almohada" y "la hermana" eliden igual.
  const rest = b[0] === "h" ? b.slice(1) : b;
  const firstChar = rest[0];
  if (!firstChar) return false;
  const lastIsVowel = isVowelChar(lastChar) || lastChar === "y";
  // La conjuncion "y" empieza por sonido vocalico: "bloque y la" van de un tiron.
  const afterY = rest[1];
  const firstIsVowel =
    isVowelChar(firstChar) || (firstChar === "y" && (afterY === undefined || !isVowelChar(afterY)));
  return lastIsVowel && firstIsVowel;
}

export function measureLine(line: string): LineMetrics {
  const words = splitWords(line);
  const syllablesByWord = words.map(syllabify);
  const rawCount = syllablesByWord.reduce((sum, s) => sum + s.length, 0);
  let sinalefas = 0;
  const metricSyllables: string[] = [];
  for (let i = 0; i < words.length; i++) {
    const syllables = syllablesByWord[i];
    if (!syllables.length) continue;
    const elides = i > 0 && joinsWithNext(words[i - 1], words[i]) && metricSyllables.length > 0;
    if (elides) {
      metricSyllables[metricSyllables.length - 1] += `\u203f${syllables[0]}`;
      metricSyllables.push(...syllables.slice(1));
      sinalefas++;
    } else {
      metricSyllables.push(...syllables);
    }
  }
  return {
    words,
    syllablesByWord,
    rawCount,
    count: Math.max(0, rawCount - sinalefas),
    sinalefas,
    metricSyllables,
    lastWord: words.length ? words[words.length - 1] : null,
  };
}
