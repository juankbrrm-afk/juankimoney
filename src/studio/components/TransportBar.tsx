import { useCallback, useEffect, useRef, useState } from "react";
import clsx from "clsx";
import { engine } from "@/studio/audio/engine";
import { NOTE_NAMES } from "@/studio/analysis/pitch";
import { useStudio, useTransport } from "@/studio/state/useStudio";
import { Button, Field } from "./ui";

/** Tempo por golpes: promedia los ultimos intervalos entre pulsaciones. */
function useTapTempo(onTempo: (bpm: number) => void) {
  const taps = useRef<number[]>([]);
  return useCallback(() => {
    const now = performance.now();
    const list = taps.current;
    if (list.length && now - list[list.length - 1] > 2200) list.length = 0;
    list.push(now);
    if (list.length > 6) list.shift();
    if (list.length < 2) return;
    let sum = 0;
    for (let i = 1; i < list.length; i++) sum += list[i] - list[i - 1];
    const bpm = 60000 / (sum / (list.length - 1));
    if (bpm >= 40 && bpm <= 220) onTempo(Math.round(bpm));
  }, [onTempo]);
}

export function TransportBar() {
  const { settings, patch, barSeconds } = useStudio();
  const { playing, position } = useTransport();
  const [busy, setBusy] = useState(false);
  const [showMore, setShowMore] = useState(false);
  const tap = useTapTempo((bpm) => patch({ bpm }));

  const toggle = useCallback(async () => {
    if (busy) return;
    setBusy(true);
    try {
      if (engine.isPlaying) engine.stop();
      else await engine.play();
    } finally {
      setBusy(false);
    }
  }, [busy]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target && /input|textarea|select/i.test(target.tagName)) return;
      if (event.code === "Space") {
        event.preventDefault();
        void toggle();
      }
      if (event.code === "KeyT") tap();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [toggle, tap]);

  const bar = playing ? Math.floor(position / barSeconds) : 0;
  const beat = playing ? Math.floor((position / (barSeconds / 4)) % 4) : 0;
  const counting = playing && position < 0;

  return (
    <div className="sticky top-0 z-30 border-b border-neutral-800 bg-neutral-950/95 backdrop-blur">
      <div className="mx-auto flex max-w-6xl flex-wrap items-end gap-4 px-4 py-3">
        <Button variant={playing ? "danger" : "primary"} onClick={toggle} className="w-24">
          {playing ? "Stop" : "Play"}
        </Button>

        <div className="min-w-24 font-mono text-lg tabular-nums">
          {counting ? (
            <span className="text-amber-400">cuenta {Math.ceil(-position / (barSeconds / 4))}</span>
          ) : (
            <span className="text-neutral-200">
              {String(bar + 1).padStart(2, "0")}
              <span className="text-neutral-600">.</span>
              {beat + 1}
            </span>
          )}
        </div>

        <Field label="BPM">
          <div className="flex items-center gap-1">
            <input
              type="number"
              min={40}
              max={220}
              value={settings.bpm}
              onChange={(e) => patch({ bpm: Number(e.target.value) || settings.bpm })}
              className="w-20 rounded-lg border border-neutral-700 bg-neutral-900 px-2 py-1.5 text-base tabular-nums"
            />
            <Button onClick={tap} className="px-2 py-1.5" title="Marca el tempo (tecla T)">
              Tap
            </Button>
          </div>
        </Field>

        <Button
          onClick={() => setShowMore((v) => !v)}
          active={showMore}
          className="sm:hidden"
          aria-label="Mas ajustes"
        >
          {showMore ? "Menos" : "Mas"}
        </Button>

        <div
          className={clsx(
            "w-full flex-wrap items-end gap-4 sm:flex sm:w-auto",
            showMore ? "flex" : "hidden"
          )}
        >
        <Field label="Compases">
          <select
            value={settings.bars}
            onChange={(e) => patch({ bars: Number(e.target.value) })}
            className="rounded-lg border border-neutral-700 bg-neutral-900 px-2 py-1.5 text-base"
          >
            {[1, 2, 4, 8].map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </Field>

        <Field label="Swing">
          <input
            type="range"
            min={0}
            max={0.6}
            step={0.02}
            value={settings.swing}
            onChange={(e) => patch({ swing: Number(e.target.value) })}
            className="w-24 accent-lime-400"
          />
        </Field>

        <Field label="808">
          <select
            value={settings.subMidi}
            onChange={(e) => patch({ subMidi: Number(e.target.value) })}
            className="rounded-lg border border-neutral-700 bg-neutral-900 px-2 py-1.5 text-base"
          >
            {NOTE_NAMES.map((name, index) => (
              <option key={name} value={24 + index}>
                {name}
              </option>
            ))}
          </select>
        </Field>

        <Field label="Cuenta">
          <select
            value={settings.countInBars}
            onChange={(e) => patch({ countInBars: Number(e.target.value) })}
            className="rounded-lg border border-neutral-700 bg-neutral-900 px-2 py-1.5 text-base"
          >
            {[0, 1, 2].map((n) => (
              <option key={n} value={n}>
                {n === 0 ? "sin" : `${n} comp.`}
              </option>
            ))}
          </select>
        </Field>

        </div>

        <div className="flex gap-2">
          <Button
            active={settings.metronome}
            onClick={() => patch({ metronome: !settings.metronome })}
          >
            Click
          </Button>
          <Button
            active={settings.beatEnabled}
            onClick={() => patch({ beatEnabled: !settings.beatEnabled })}
          >
            Beat
          </Button>
        </div>
      </div>
    </div>
  );
}
