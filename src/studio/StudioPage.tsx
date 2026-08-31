import { useEffect, useState } from "react";
import clsx from "clsx";
import { StudioProvider } from "./state/useStudio";
import { engine } from "./audio/engine";
import { recorder } from "./audio/recorder";
import { TransportBar } from "./components/TransportBar";
import { HacerCancion } from "./components/HacerCancion";
import { EstiloPicker } from "./components/EstiloPicker";
import { BeatboxPanel } from "./components/BeatboxPanel";
import { StepSequencer } from "./components/StepSequencer";
import { LyricLab } from "./components/LyricLab";
import { Guion } from "./components/Guion";
import { RecordPanel } from "./components/RecordPanel";
import { MixPanel } from "./components/MixPanel";

const TABS = [
  { id: "ritmo", label: "Ritmo", hint: "Elige el estilo, o saca el beat de tu propia boca." },
  { id: "letra", label: "Letra", hint: "Pega la letra y se ordena como cancion." },
  { id: "guion", label: "Guion", hint: "Que se canta en cada compas, iluminado al ritmo." },
  { id: "grabar", label: "Grabar", hint: "Tomas de voz sobre el beat, con analisis de timing." },
  { id: "mezcla", label: "Mezcla", hint: "Niveles y exportacion a WAV." },
] as const;

type TabId = (typeof TABS)[number]["id"];

/**
 * Estudio de grabacion en el navegador. Todo el proceso pasa por tu voz:
 * el ritmo sale de tu beatbox, la letra se mide contra la rejilla y cada toma
 * se analiza para decirte donde se te va el flow.
 */
function StudioShell() {
  const [avanzado, setAvanzado] = useState(false);
  const [tab, setTab] = useState<TabId>("ritmo");

  useEffect(
    () => () => {
      engine.stop();
      recorder.dispose();
    },
    []
  );

  return (
    <div className="min-h-screen bg-neutral-950 font-sans text-neutral-100">
      {avanzado && <TransportBar />}

      <div className="mx-auto max-w-3xl px-4 py-6">
        <header className="mb-6 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Estudio</h1>
            <p className="mt-1 max-w-xl text-sm text-neutral-500">
              {avanzado
                ? "Todos los mandos: patrón, rimas, tomas sueltas y mezcla."
                : "Pega tu letra, elige cómo quieres que suene y cántala. La canción se monta sola, con tu voz."}
            </p>
          </div>
          <button
            type="button"
            onClick={() => setAvanzado((v) => !v)}
            className="rounded-lg border border-neutral-700 px-3 py-1.5 text-xs text-neutral-400 hover:border-neutral-500 hover:text-neutral-100"
          >
            {avanzado ? "Modo simple" : "Modo avanzado"}
          </button>
        </header>

        {!avanzado ? (
          <HacerCancion />
        ) : (
          <>
            <nav className="mb-6 flex flex-wrap gap-2 border-b border-neutral-800 pb-3">
              {TABS.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setTab(item.id)}
                  className={clsx(
                    "rounded-lg px-3 py-2 text-sm font-semibold transition-colors",
                    tab === item.id
                      ? "bg-neutral-100 text-neutral-950"
                      : "text-neutral-400 hover:bg-neutral-900 hover:text-neutral-100"
                  )}
                >
                  {item.label}
                </button>
              ))}
              <p className="w-full pt-1 text-xs text-neutral-600">
                {TABS.find((item) => item.id === tab)?.hint}
              </p>
            </nav>

            {tab === "ritmo" && (
              <div className="space-y-4">
                <EstiloPicker />
                <BeatboxPanel />
                <StepSequencer />
              </div>
            )}
            {tab === "letra" && <LyricLab />}
            {tab === "guion" && <Guion />}
            {tab === "grabar" && <RecordPanel />}
            {tab === "mezcla" && <MixPanel />}
          </>
        )}

        <footer className="mt-10 border-t border-neutral-900 pt-4 text-xs text-neutral-700">
          Nada de lo que grabas sale de este teléfono.
        </footer>
      </div>
    </div>
  );
}

export function StudioPage() {
  return (
    <StudioProvider>
      <StudioShell />
    </StudioProvider>
  );
}

export default StudioPage;
