/**
 * Vocabulario musical del producto.
 *
 * Cada género trae los datos que el pipeline necesita de verdad: rango de
 * tempo, descriptores para el prompt del motor musical y la referencia de
 * masterización. No es una lista de etiquetas para un desplegable — es lo
 * que convierte "reguetón" en instrucciones concretas para tres proveedores
 * distintos.
 */

export const GENRES = [
  'pop',
  'reggaeton',
  'rock',
  'electronic',
  'ballad',
  'rap',
  'trap',
  'rnb',
  'indie',
  'latin-pop',
  'bachata',
  'cumbia',
  'lofi',
  'country',
] as const;

export type Genre = (typeof GENRES)[number];

export interface GenreProfile {
  readonly id: Genre;
  /** Etiqueta en español para la interfaz. */
  readonly label: string;
  /** Emoji usado como marca visual compacta en las tarjetas. */
  readonly icon: string;
  readonly bpm: readonly [min: number, max: number];
  /** Descriptores inyectados en el prompt del motor musical. */
  readonly descriptors: readonly string[];
  /** Instrumentación típica; ayuda al modelo a fijar el arreglo. */
  readonly instrumentation: readonly string[];
  /** Objetivo de sonoridad integrada (LUFS) en masterización. */
  readonly targetLufs: number;
  /**
   * Cuánto se aparta la voz del centro del rango vocal del usuario.
   * El rap se mantiene cerca del habla; la balada exige más recorrido.
   */
  readonly vocalIntensity: 'spoken' | 'melodic' | 'powerful';
}

export const GENRE_PROFILES: Readonly<Record<Genre, GenreProfile>> = {
  pop: {
    id: 'pop',
    label: 'Pop',
    icon: '🎤',
    bpm: [100, 128],
    descriptors: ['modern pop', 'polished production', 'catchy hook', 'bright mix'],
    instrumentation: ['synth pads', 'electric bass', 'programmed drums', 'piano'],
    targetLufs: -9,
    vocalIntensity: 'melodic',
  },
  reggaeton: {
    id: 'reggaeton',
    label: 'Reguetón',
    icon: '🔥',
    bpm: [88, 100],
    descriptors: ['reggaeton', 'dembow rhythm', 'latin urban', 'club-ready'],
    instrumentation: ['dembow drums', 'sub bass', 'synth stabs', 'percussion loops'],
    targetLufs: -8,
    vocalIntensity: 'spoken',
  },
  rock: {
    id: 'rock',
    label: 'Rock',
    icon: '🎸',
    bpm: [110, 150],
    descriptors: ['rock', 'driving guitars', 'live drum energy', 'analog warmth'],
    instrumentation: ['distorted electric guitar', 'bass guitar', 'acoustic drums'],
    targetLufs: -10,
    vocalIntensity: 'powerful',
  },
  electronic: {
    id: 'electronic',
    label: 'Electrónica',
    icon: '🎛️',
    bpm: [120, 138],
    descriptors: ['electronic dance', 'sidechained pads', 'festival build', 'wide stereo'],
    instrumentation: ['supersaw synths', 'four-on-the-floor drums', 'sub bass'],
    targetLufs: -8,
    vocalIntensity: 'melodic',
  },
  ballad: {
    id: 'ballad',
    label: 'Balada',
    icon: '🕯️',
    bpm: [60, 80],
    descriptors: ['emotional ballad', 'intimate', 'cinematic strings', 'dynamic range'],
    instrumentation: ['grand piano', 'string section', 'soft drums', 'acoustic guitar'],
    targetLufs: -12,
    vocalIntensity: 'powerful',
  },
  rap: {
    id: 'rap',
    label: 'Rap',
    icon: '🎧',
    bpm: [80, 95],
    descriptors: ['hip hop', 'boom bap groove', 'sample-based', 'punchy drums'],
    instrumentation: ['drum breaks', 'upright bass', 'vinyl samples', 'rhodes'],
    targetLufs: -9,
    vocalIntensity: 'spoken',
  },
  trap: {
    id: 'trap',
    label: 'Trap',
    icon: '💎',
    bpm: [130, 150],
    descriptors: ['trap', 'rolling hi-hats', '808 bass', 'dark atmosphere'],
    instrumentation: ['808 drums', 'hi-hat rolls', 'dark synth leads'],
    targetLufs: -8,
    vocalIntensity: 'spoken',
  },
  rnb: {
    id: 'rnb',
    label: 'R&B',
    icon: '🌙',
    bpm: [70, 95],
    descriptors: ['contemporary r&b', 'smooth', 'lush harmony', 'silky texture'],
    instrumentation: ['electric piano', 'fretless bass', 'soft drums', 'vocal pads'],
    targetLufs: -10,
    vocalIntensity: 'melodic',
  },
  indie: {
    id: 'indie',
    label: 'Indie',
    icon: '🌾',
    bpm: [95, 125],
    descriptors: ['indie', 'lo-fi charm', 'jangly guitars', 'organic room sound'],
    instrumentation: ['clean electric guitar', 'analog synth', 'live drums'],
    targetLufs: -11,
    vocalIntensity: 'melodic',
  },
  'latin-pop': {
    id: 'latin-pop',
    label: 'Pop latino',
    icon: '☀️',
    bpm: [95, 118],
    descriptors: ['latin pop', 'sunny', 'acoustic-electronic blend', 'radio-ready'],
    instrumentation: ['nylon guitar', 'latin percussion', 'synth bass'],
    targetLufs: -9,
    vocalIntensity: 'melodic',
  },
  bachata: {
    id: 'bachata',
    label: 'Bachata',
    icon: '💃',
    bpm: [120, 140],
    descriptors: ['bachata', 'romantic', 'syncopated guitar', 'bongó groove'],
    instrumentation: ['requinto guitar', 'bongó', 'güira', 'bass guitar'],
    targetLufs: -10,
    vocalIntensity: 'melodic',
  },
  cumbia: {
    id: 'cumbia',
    label: 'Cumbia',
    icon: '🪘',
    bpm: [85, 105],
    descriptors: ['cumbia', 'festive', 'accordion melody', 'danceable groove'],
    instrumentation: ['accordion', 'güira', 'bass guitar', 'timbales'],
    targetLufs: -9,
    vocalIntensity: 'melodic',
  },
  lofi: {
    id: 'lofi',
    label: 'Lo-fi',
    icon: '📼',
    bpm: [70, 88],
    descriptors: ['lo-fi hip hop', 'dusty', 'tape saturation', 'relaxed swing'],
    instrumentation: ['rhodes piano', 'soft drums', 'vinyl crackle', 'warm bass'],
    targetLufs: -14,
    vocalIntensity: 'spoken',
  },
  country: {
    id: 'country',
    label: 'Country',
    icon: '🤠',
    bpm: [90, 130],
    descriptors: ['country', 'storytelling', 'pedal steel', 'wide acoustic mix'],
    instrumentation: ['acoustic guitar', 'pedal steel', 'fiddle', 'brush drums'],
    targetLufs: -11,
    vocalIntensity: 'melodic',
  },
};

/** Idiomas soportados para letras y canto. */
export const LANGUAGES = ['es', 'en', 'pt', 'fr', 'it', 'de', 'ja', 'ko'] as const;
export type Language = (typeof LANGUAGES)[number];

export const LANGUAGE_LABELS: Readonly<Record<Language, string>> = {
  es: 'Español',
  en: 'Inglés',
  pt: 'Portugués',
  fr: 'Francés',
  it: 'Italiano',
  de: 'Alemán',
  ja: 'Japonés',
  ko: 'Coreano',
};

/**
 * Timbre objetivo del canto.
 *
 * `natural` respeta el registro del modelo de voz del usuario. Los otros dos
 * desplazan el tono en la conversión — es un cambio de registro, no un
 * intercambio de identidad: sigue siendo la voz del usuario.
 */
export const VOCAL_TIMBRES = ['natural', 'masculine', 'feminine'] as const;
export type VocalTimbre = (typeof VOCAL_TIMBRES)[number];

export const TIMBRE_LABELS: Readonly<Record<VocalTimbre, string>> = {
  natural: 'Natural (tu registro)',
  masculine: 'Masculina',
  feminine: 'Femenina',
};

/**
 * Semitonos de desplazamiento aplicados en la conversión de voz.
 * Se combinan con el sexo declarado del modelo para no transponer de más:
 * subir 12 semitonos una voz ya aguda produce el efecto "ardilla".
 */
export function pitchShiftFor(timbre: VocalTimbre, modelIsLow: boolean): number {
  if (timbre === 'natural') return 0;
  if (timbre === 'masculine') return modelIsLow ? 0 : -5;
  return modelIsLow ? 5 : 0;
}

/** Estructuras de canción ofrecidas al usuario. */
export const SONG_STRUCTURES = ['standard', 'verse-chorus', 'story', 'anthem'] as const;
export type SongStructure = (typeof SONG_STRUCTURES)[number];

export interface StructureTemplate {
  readonly id: SongStructure;
  readonly label: string;
  readonly sections: readonly SectionKind[];
  readonly description: string;
}

export const SECTION_KINDS = [
  'intro',
  'verse',
  'pre-chorus',
  'chorus',
  'bridge',
  'outro',
] as const;
export type SectionKind = (typeof SECTION_KINDS)[number];

export const STRUCTURE_TEMPLATES: Readonly<Record<SongStructure, StructureTemplate>> = {
  standard: {
    id: 'standard',
    label: 'Estándar',
    sections: ['intro', 'verse', 'chorus', 'verse', 'chorus', 'bridge', 'chorus', 'outro'],
    description: 'La forma más reconocible. Funciona en casi cualquier género.',
  },
  'verse-chorus': {
    id: 'verse-chorus',
    label: 'Directa',
    sections: ['verse', 'chorus', 'verse', 'chorus', 'outro'],
    description: 'Sin puente ni intro. Va al grano; ideal para pistas cortas.',
  },
  story: {
    id: 'story',
    label: 'Narrativa',
    sections: ['intro', 'verse', 'verse', 'pre-chorus', 'chorus', 'verse', 'chorus', 'outro'],
    description: 'Más versos que estribillos. Para letras que cuentan algo.',
  },
  anthem: {
    id: 'anthem',
    label: 'Himno',
    sections: ['intro', 'chorus', 'verse', 'chorus', 'bridge', 'chorus', 'chorus', 'outro'],
    description: 'Abre con el estribillo y lo repite. Máxima pegada.',
  },
};

export const SECTION_LABELS: Readonly<Record<SectionKind, string>> = {
  intro: 'Intro',
  verse: 'Verso',
  'pre-chorus': 'Pre-estribillo',
  chorus: 'Estribillo',
  bridge: 'Puente',
  outro: 'Outro',
};

/** Duración típica en segundos de cada sección, escalada por tempo. */
export const SECTION_BASE_SECONDS: Readonly<Record<SectionKind, number>> = {
  intro: 8,
  verse: 24,
  'pre-chorus': 12,
  chorus: 24,
  bridge: 16,
  outro: 10,
};

/** Estima la duración de una canción a partir de estructura y tempo. */
export function estimateDurationSeconds(structure: SongStructure, bpm: number): number {
  const tempoFactor = 110 / Math.max(bpm, 40);
  const total = STRUCTURE_TEMPLATES[structure].sections.reduce(
    (sum, section) => sum + SECTION_BASE_SECONDS[section],
    0,
  );
  return Math.round(total * tempoFactor);
}

/** Tempo por defecto de un género: el centro de su rango. */
export function defaultBpm(genre: Genre): number {
  const [min, max] = GENRE_PROFILES[genre].bpm;
  return Math.round((min + max) / 2);
}
