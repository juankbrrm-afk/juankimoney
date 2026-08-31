import { useEffect, useRef } from "react";
import clsx from "clsx";
import { DRUM_VOICES, VOICE_LABELS } from "@/studio/types";
import type { DrumVoice } from "@/studio/types";
import { engine } from "@/studio/audio/engine";
import { useStudio, useTransport } from "@/studio/state/useStudio";
import { Button, Panel } from "./ui";

export function StepSequencer() {
  const { pattern, settings, toggleStep, setPattern, clearPattern } = useStudio();
  const { playing, step } = useTransport();
  const painting = useRef<null | "on" | "off">(null);
  const total = settings.stepsPerBar * settings.bars;
  const active = playing && step >= 0 ? ((step % total) + total) % total : -1;

  useEffect(() => {
    const stop = () => {
      painting.current = null;
    };
    window.addEventListener("pointerup", stop);
    return () => window.removeEventListener("pointerup", stop);
  }, []);

  const paint = (voice: DrumVoice, index: number, mode: "on" | "off") => {
    setPattern({
      ...pattern,
      [voice]: pattern[voice].map((v, i) => (i === index ? (mode === "on" ? 0.9 : 0) : v)),
    });
  };

  return (
    <Panel
      title="Patron"
      hint="Pincha para poner o quitar golpes; arrastra para pintar varios. Shift = golpe fantasma."
      actions={
        <Button onClick={clearPattern} className="px-2 py-1 text-xs">
          Vaciar
        </Button>
      }
    >
      <div className="overflow-x-auto pb-2">
        <div className="min-w-max space-y-1">
          <div className="flex items-center gap-1 pl-24">
            {Array.from({ length: total }, (_, i) => (
              <div
                key={i}
                className={clsx(
                  "w-6 text-center text-[10px] tabular-nums",
                  i % settings.stepsPerBar === 0 ? "text-neutral-300" : "text-neutral-700"
                )}
              >
                {i % 4 === 0 ? Math.floor(i / 4) % (settings.stepsPerBar / 4) + 1 : "·"}
              </div>
            ))}
          </div>

          {DRUM_VOICES.map((voice) => (
            <div key={voice} className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => void engine.audition(voice)}
                className="w-24 shrink-0 rounded px-1 py-1 text-left text-xs text-neutral-400 hover:bg-neutral-800 hover:text-neutral-100"
                title="Escuchar"
              >
                {VOICE_LABELS[voice]}
              </button>
              {pattern[voice].slice(0, total).map((velocity, index) => {
                const isBeat = index % 4 === 0;
                const isBarStart = index % settings.stepsPerBar === 0;
                return (
                  <button
                    key={index}
                    type="button"
                    onPointerDown={(event) => {
                      const mode = velocity > 0 ? "off" : "on";
                      painting.current = mode;
                      if (event.shiftKey && velocity === 0) {
                        setPattern({
                          ...pattern,
                          [voice]: pattern[voice].map((v, i) => (i === index ? 0.45 : v)),
                        });
                        painting.current = null;
                      } else {
                        toggleStep(voice, index);
                      }
                    }}
                    onPointerEnter={() => {
                      if (painting.current) paint(voice, index, painting.current);
                    }}
                    className={clsx(
                      "h-7 w-6 rounded-sm border transition-colors",
                      isBarStart ? "border-l-2 border-l-neutral-600" : "",
                      velocity > 0.6
                        ? "border-lime-300 bg-lime-400"
                        : velocity > 0
                          ? "border-lime-600 bg-lime-700/70"
                          : isBeat
                            ? "border-neutral-700 bg-neutral-800"
                            : "border-neutral-800 bg-neutral-900",
                      active === index && "ring-2 ring-white/70"
                    )}
                    aria-label={`${VOICE_LABELS[voice]} paso ${index + 1}`}
                  />
                );
              })}
            </div>
          ))}
        </div>
      </div>
    </Panel>
  );
}
