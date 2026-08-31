import { normalizeWord, syllabify, stressIndex, accentuation } from "./syllables";

/**
 * Rima castellana. Se trabaja sobre la "cola tonica": desde la vocal acentuada
 * hasta el final de la palabra. Consonante = suena igual todo; asonante = solo
 * coinciden las vocales.
 */

const UNACCENT: Record<string, string> = {
  á: "a",
  é: "e",
  í: "i",
  ó: "o",
  ú: "u",
  ü: "u",
  à: "a",
  è: "e",
  ì: "i",
  ò: "o",
};

/** Reduce la ortografia a algo parecido a como suena. */
export function phonetic(text: string): string {
  let out = text.toLowerCase();
  out = out.replace(/[áéíóúüàèìò]/g, (c) => UNACCENT[c] ?? c);
  out = out.replace(/ch/g, "C");
  out = out.replace(/ll/g, "Y");
  out = out.replace(/qu(?=[ei])/g, "k");
  out = out.replace(/gu(?=[ei])/g, "G");
  out = out.replace(/c(?=[ei])/g, "s");
  out = out.replace(/g(?=[ei])/g, "j");
  out = out.replace(/[cqk]/g, "k");
  out = out.replace(/G/g, "g");
  out = out.replace(/z/g, "s");
  out = out.replace(/v/g, "b");
  out = out.replace(/h/g, "");
  out = out.replace(/x/g, "ks");
  out = out.replace(/w/g, "u");
  out = out.replace(/rr/g, "r");
  out = out.replace(/y(?![aeiou])/g, "i");
  out = out.replace(/(.)\1+/g, "$1");
  return out;
}

const VOWEL_SET = "aeiou";

function vowelsOf(text: string): string {
  return [...text].filter((c) => VOWEL_SET.includes(c)).join("");
}

export interface RhymeKeys {
  word: string;
  /** Cola desde la silaba tonica, ya fonetizada. */
  tail: string;
  consonante: string;
  asonante: string;
  syllableCount: number;
  accent: ReturnType<typeof accentuation>;
}

export function rhymeKeys(rawWord: string): RhymeKeys | null {
  const word = normalizeWord(rawWord);
  if (!word) return null;
  const syllables = syllabify(word);
  if (!syllables.length) return null;
  const stress = stressIndex(word);
  const tailRaw = syllables.slice(stress).join("");
  const tail = phonetic(tailRaw);

  // La consonante arranca en la vocal tonica: "cantar"/"lugar" riman en "ar".
  const firstVowel = [...tail].findIndex((c) => VOWEL_SET.includes(c));
  const consonante = firstVowel >= 0 ? tail.slice(firstVowel) : tail;

  let vowels = vowelsOf(consonante);
  // En esdrujulas solo cuentan la vocal tonica y la ultima.
  if (vowels.length > 2) vowels = vowels[0] + vowels[vowels.length - 1];

  return {
    word,
    tail,
    consonante,
    asonante: vowels,
    syllableCount: syllables.length,
    accent: accentuation(word),
  };
}

export type RhymeType = "consonante" | "asonante" | "cercana";

export interface RhymeMatch {
  word: string;
  type: RhymeType;
  score: number;
  syllableCount: number;
}

function tailSimilarity(a: string, b: string): number {
  let shared = 0;
  const max = Math.min(a.length, b.length);
  while (shared < max && a[a.length - 1 - shared] === b[b.length - 1 - shared]) shared++;
  return shared / Math.max(a.length, b.length, 1);
}

/** Clasifica la rima entre dos palabras. `null` si no riman de ninguna forma. */
export function compareRhyme(a: string, b: string): RhymeMatch | null {
  const ka = rhymeKeys(a);
  const kb = rhymeKeys(b);
  if (!ka || !kb) return null;
  if (ka.word === kb.word) return null;
  if (ka.consonante === kb.consonante) {
    return { word: kb.word, type: "consonante", score: 1, syllableCount: kb.syllableCount };
  }
  if (ka.asonante === kb.asonante && ka.asonante.length > 0) {
    return { word: kb.word, type: "asonante", score: 0.7, syllableCount: kb.syllableCount };
  }
  const similarity = tailSimilarity(ka.consonante, kb.consonante);
  const lastVowelMatch = ka.asonante.at(-1) === kb.asonante.at(-1);
  if (similarity >= 0.5 || (lastVowelMatch && similarity >= 0.34)) {
    return {
      word: kb.word,
      type: "cercana",
      score: 0.3 + similarity * 0.3,
      syllableCount: kb.syllableCount,
    };
  }
  return null;
}

/** Busca rimas de `word` dentro de un banco de palabras. */
export function findRhymes(
  word: string,
  bank: readonly string[],
  options: { limit?: number; minType?: RhymeType } = {}
): RhymeMatch[] {
  const { limit = 40, minType = "cercana" } = options;
  const floor = minType === "consonante" ? 1 : minType === "asonante" ? 0.7 : 0;
  const seen = new Set<string>([normalizeWord(word)]);
  const matches: RhymeMatch[] = [];
  for (const candidate of bank) {
    const match = compareRhyme(word, candidate);
    if (!match || match.score < floor) continue;
    if (seen.has(match.word)) continue;
    seen.add(match.word);
    matches.push(match);
  }
  matches.sort((a, b) => b.score - a.score || a.syllableCount - b.syllableCount);
  return matches.slice(0, limit);
}

/**
 * Etiqueta el esquema de rima de una lista de versos: A, B, C... segun con
 * quien rime cada final. Los versos que no riman con nadie quedan en "-".
 */
export function rhymeScheme(lastWords: (string | null)[]): string[] {
  const labels: string[] = new Array(lastWords.length).fill("-");
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  let next = 0;
  for (let i = 0; i < lastWords.length; i++) {
    const word = lastWords[i];
    if (!word || labels[i] !== "-") continue;
    const group: number[] = [];
    for (let j = i + 1; j < lastWords.length; j++) {
      const other = lastWords[j];
      if (!other || labels[j] !== "-") continue;
      const match = compareRhyme(word, other);
      if (match && match.score >= 0.7) group.push(j);
    }
    if (!group.length) continue;
    const label = alphabet[next % alphabet.length];
    next++;
    labels[i] = label;
    for (const j of group) labels[j] = label;
  }
  return labels;
}
