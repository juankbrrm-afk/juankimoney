/** Tipos compartidos por el motor de audio, el analisis y la UI del estudio. */

export const DRUM_VOICES = ["kick", "sub", "snare", "clap", "hat", "openhat"] as const;
export type DrumVoice = (typeof DRUM_VOICES)[number];

export const VOICE_LABELS: Record<DrumVoice, string> = {
  kick: "Bombo",
  sub: "808",
  snare: "Caja",
  clap: "Palmas",
  hat: "Hi-hat",
  openhat: "Hat abierto",
};

/** Un patron es, por voz, una velocidad 0..1 por paso (0 = silencio). */
export type Pattern = Record<DrumVoice, number[]>;

export interface Take {
  id: string;
  name: string;
  buffer: AudioBuffer;
  /** Segundos desde el compas 1 del tema hasta el primer sample de la toma. */
  offset: number;
  /** Alineacion calculada al grabar. El deslizador de ajuste parte de aqui. */
  baseOffset: number;
  gain: number;
  muted: boolean;
  soloed: boolean;
  createdAt: number;
}

export interface Section {
  id: string;
  /** Intro, Verso, Pre, Coro, Puente... */
  kind: string;
  bars: number;
  lyrics: string;
}

export function emptyPattern(steps: number): Pattern {
  return {
    kick: new Array(steps).fill(0),
    sub: new Array(steps).fill(0),
    snare: new Array(steps).fill(0),
    clap: new Array(steps).fill(0),
    hat: new Array(steps).fill(0),
    openhat: new Array(steps).fill(0),
  };
}

export function resizePattern(pattern: Pattern, steps: number): Pattern {
  const next = emptyPattern(steps);
  for (const voice of DRUM_VOICES) {
    const source = pattern[voice] ?? [];
    for (let i = 0; i < steps; i++) next[voice][i] = source[i % Math.max(1, source.length)] ?? 0;
  }
  return next;
}
