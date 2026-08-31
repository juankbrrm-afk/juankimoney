import { useEffect, useState } from "react";
import clsx from "clsx";
import { StudioProvider } from "./state/useStudio";
import { engine } from "./audio/engine";
import { recorder } from "./audio/recorder";
import { TransportBar } from "./components/TransportBar";
import { BeatboxPanel } from "./components/BeatboxPanel";
import { StepSequencer } from "./components/StepSequencer";
import { LyricLab } from "./components/LyricLab";
import { RecordPanel } from "./components/RecordPanel";
import { MixPanel } from "./components/MixPanel";

const TABS = [
  { id: "ritmo", label: "Ritmo", hint: "Saca el beat de tu boca y ajusta el patron." },
  { id: "letra", label: "Letra", hint: "Silabas, rimas y reparto del flow." },
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
      <TransportBar />

      <div className="mx-auto max-w-6xl px-4 py-6">
        <header className="mb-6">
          <h1 className="text-2xl font-bold tracking-tight">Estudio</h1>
          <p className="mt-1 max-w-2xl text-sm text-neutral-500">
            Marca el ritmo con la boca, escribe encima de la rejilla y graba tu voz. El sistema
            saca el tempo de tus golpes, mide las silabas y te dice cuanto se te adelanta o se te
            atrasa el flow. Nada sale de tu navegador.
          </p>
        </header>

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
            <BeatboxPanel />
            <StepSequencer />
          </div>
        )}
        {tab === "letra" && <LyricLab />}
        {tab === "grabar" && <RecordPanel />}
        {tab === "mezcla" && <MixPanel />}

        <footer className="mt-10 border-t border-neutral-900 pt-4 text-xs text-neutral-700">
          Espacio: play/stop · T: marcar tempo
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
