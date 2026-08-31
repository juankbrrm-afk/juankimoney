import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { ReactNode } from "react";
import type { DrumVoice, Pattern, Section, Take } from "@/studio/types";
import { emptyPattern, resizePattern } from "@/studio/types";
import type { EngineSettings, EngineTick } from "@/studio/audio/engine";
import { engine } from "@/studio/audio/engine";

const STORAGE_KEY = "juankimoney.studio.v1";

export interface StudioSettings extends EngineSettings {
  /** Compensacion de latencia al alinear tomas, en ms. */
  latencyMs: number;
  flowTemplateId: string;
  /** Estilo elegido, si hay alguno. */
  estiloId: string | null;
  /** Semicorcheas del compas donde cae cada silaba del flow del estilo. */
  flowSteps: number[];
  /**
   * Cuanto se recuesta la voz respecto a la rejilla al cuadrarla, en ms.
   * Positivo = por detras del beat. Es lo que le da caida al flow.
   */
  aireMs: number;
}

const DEFAULT_SETTINGS: StudioSettings = {
  bpm: 90,
  stepsPerBar: 16,
  bars: 2,
  swing: 0,
  subMidi: 33,
  metronome: true,
  beatEnabled: true,
  countInBars: 1,
  guideSteps: [],
  acordes: [0, 8, 3, 10],
  modo: "menor",
  latencyMs: 0,
  flowTemplateId: "recto",
  estiloId: null,
  flowSteps: [0, 2, 4, 6, 8, 10, 12, 14],
  aireMs: 0,
};

const DEFAULT_SECTIONS: Section[] = [
  { id: "s1", kind: "Verso", bars: 16, lyrics: "" },
  { id: "s2", kind: "Coro", bars: 8, lyrics: "" },
];

interface Persisted {
  settings: StudioSettings;
  pattern: Pattern;
  sections: Section[];
}

function load(): Persisted | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<Persisted>;
    if (!parsed.settings || !parsed.pattern) return null;
    return {
      settings: { ...DEFAULT_SETTINGS, ...parsed.settings },
      pattern: parsed.pattern,
      sections: parsed.sections?.length ? parsed.sections : DEFAULT_SECTIONS,
    };
  } catch {
    return null;
  }
}

interface StudioValue {
  settings: StudioSettings;
  patch: (settings: Partial<StudioSettings>) => void;

  pattern: Pattern;
  setPattern: (pattern: Pattern) => void;
  toggleStep: (voice: DrumVoice, step: number) => void;
  clearPattern: () => void;

  takes: Take[];
  addTake: (take: Take) => void;
  updateTake: (id: string, patch: Partial<Take>) => void;
  removeTake: (id: string) => void;

  sections: Section[];
  setSections: (sections: Section[]) => void;
  updateSection: (id: string, patch: Partial<Section>) => void;
  addSection: () => void;
  removeSection: (id: string) => void;

  stepSeconds: number;
  barSeconds: number;
}

const StudioContext = createContext<StudioValue | null>(null);

export function StudioProvider({ children }: { children: ReactNode }) {
  const initial = useRef<Persisted | null>(null);
  if (initial.current === null) initial.current = load();

  const [settings, setSettings] = useState<StudioSettings>(
    initial.current?.settings ?? DEFAULT_SETTINGS
  );
  const [pattern, setPatternState] = useState<Pattern>(
    initial.current?.pattern ?? emptyPattern(DEFAULT_SETTINGS.stepsPerBar * DEFAULT_SETTINGS.bars)
  );
  const [sections, setSections] = useState<Section[]>(
    initial.current?.sections ?? DEFAULT_SECTIONS
  );
  const [takes, setTakes] = useState<Take[]>([]);

  // El motor vive fuera de React; aqui solo le pasamos el estado actual.
  useEffect(() => {
    engine.update(settings);
  }, [settings]);
  useEffect(() => {
    engine.setPattern(pattern);
  }, [pattern]);
  useEffect(() => {
    engine.setTakes(takes);
  }, [takes]);

  useEffect(() => {
    const id = window.setTimeout(() => {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify({ settings, pattern, sections }));
      } catch {
        // Cuota llena o modo privado: seguimos sin guardar.
      }
    }, 400);
    return () => window.clearTimeout(id);
  }, [settings, pattern, sections]);

  const patch = useCallback((next: Partial<StudioSettings>) => {
    setSettings((current) => {
      const merged = { ...current, ...next };
      const steps = merged.stepsPerBar * merged.bars;
      if (steps !== current.stepsPerBar * current.bars) {
        setPatternState((p) => resizePattern(p, steps));
      }
      return merged;
    });
  }, []);

  const setPattern = useCallback((next: Pattern) => setPatternState(next), []);

  const toggleStep = useCallback((voice: DrumVoice, step: number) => {
    setPatternState((current) => {
      const column = [...current[voice]];
      column[step] = column[step] > 0 ? 0 : 0.9;
      return { ...current, [voice]: column };
    });
  }, []);

  const clearPattern = useCallback(() => {
    setPatternState(emptyPattern(settings.stepsPerBar * settings.bars));
  }, [settings.stepsPerBar, settings.bars]);

  const addTake = useCallback((take: Take) => setTakes((current) => [...current, take]), []);

  const updateTake = useCallback((id: string, next: Partial<Take>) => {
    setTakes((current) => current.map((t) => (t.id === id ? { ...t, ...next } : t)));
  }, []);

  const removeTake = useCallback((id: string) => {
    setTakes((current) => current.filter((t) => t.id !== id));
  }, []);

  const updateSection = useCallback((id: string, next: Partial<Section>) => {
    setSections((current) => current.map((s) => (s.id === id ? { ...s, ...next } : s)));
  }, []);

  const addSection = useCallback(() => {
    setSections((current) => [
      ...current,
      { id: `s${Date.now()}`, kind: "Verso", bars: 16, lyrics: "" },
    ]);
  }, []);

  const removeSection = useCallback((id: string) => {
    setSections((current) => current.filter((s) => s.id !== id));
  }, []);

  const stepSeconds = ((60 / settings.bpm) * 4) / settings.stepsPerBar;

  const value = useMemo<StudioValue>(
    () => ({
      settings,
      patch,
      pattern,
      setPattern,
      toggleStep,
      clearPattern,
      takes,
      addTake,
      updateTake,
      removeTake,
      sections,
      setSections,
      updateSection,
      addSection,
      removeSection,
      stepSeconds,
      barSeconds: stepSeconds * settings.stepsPerBar,
    }),
    [
      settings,
      patch,
      pattern,
      setPattern,
      toggleStep,
      clearPattern,
      takes,
      addTake,
      updateTake,
      removeTake,
      sections,
      updateSection,
      addSection,
      removeSection,
      stepSeconds,
    ]
  );

  return <StudioContext.Provider value={value}>{children}</StudioContext.Provider>;
}

export function useStudio(): StudioValue {
  const value = useContext(StudioContext);
  if (!value) throw new Error("useStudio debe usarse dentro de <StudioProvider>");
  return value;
}

/**
 * Suscripcion al transporte. Vive aparte del contexto para que el parpadeo del
 * cabezal (40 veces por segundo) solo repinte lo que de verdad lo necesita.
 */
export function useTransport(): EngineTick {
  const [tick, setTick] = useState<EngineTick>({ playing: false, step: 0, position: 0 });
  useEffect(() => engine.subscribe(setTick), []);
  return tick;
}
