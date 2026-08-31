import { useCallback, useRef, useState } from "react";
import { engine } from "@/studio/audio/engine";
import { recorder } from "@/studio/audio/recorder";
import { useStudio } from "@/studio/state/useStudio";
import { useMicLevel } from "@/studio/state/useMicLevel";
import { Button, Meter, Panel } from "./ui";
import { TakeCard } from "./TakeCard";

/**
 * Grabacion de tomas sobre el beat. La toma se ancla al compas 1 usando el
 * reloj del contexto de audio y se le resta la latencia de salida, que es lo
 * que hace que uno cante "tarde" sin darse cuenta.
 */
export function RecordPanel() {
  const { settings, patch, takes, addTake } = useStudio();
  const [armed, setArmed] = useState(false);
  const [recording, setRecording] = useState(false);
  const [monitor, setMonitor] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** Offset de la toma en curso: se fija al arrancar y se lee al parar. */
  const pendingOffset = useRef(0);
  const level = useMicLevel(armed);

  const arm = useCallback(async () => {
    setError(null);
    try {
      const ctx = await engine.ensureContext();
      await recorder.arm(ctx, engine.master!);
      if (settings.latencyMs === 0) {
        patch({ latencyMs: Math.round(engine.outputLatencyMs) });
      }
      setArmed(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo abrir el microfono");
    }
  }, [patch, settings.latencyMs]);

  const start = useCallback(async () => {
    if (!armed) await arm();
    if (!recorder.armed) return;
    await engine.play();
    const startTime = recorder.start();
    const offset = startTime - engine.anchorTime - settings.latencyMs / 1000;
    // Se calcula aqui, con el ancla del transporte vivo, y se usa al parar.
    pendingOffset.current = offset;
    setRecording(true);
  }, [armed, arm, settings.latencyMs]);

  const stop = useCallback(() => {
    const recorded = recorder.stop();
    engine.stop();
    setRecording(false);
    if (!recorded) {
      setError("La toma salio vacia.");
      return;
    }
    addTake({
      id: `t${Date.now()}`,
      name: `Toma ${takes.length + 1}`,
      buffer: recorded.buffer,
      offset: pendingOffset.current,
      baseOffset: pendingOffset.current,
      gain: 1,
      muted: false,
      soloed: false,
      createdAt: Date.now(),
    });
  }, [addTake, takes.length]);

  const toggleMonitor = () => {
    const next = !monitor;
    setMonitor(next);
    recorder.setMonitor(next);
  };

  return (
    <div className="space-y-4">
      <Panel
        title="Grabar tu voz"
        hint="Suena el beat con la cuenta de entrada y tu cantas encima. Cada toma se alinea sola con el compas 1; si notas que va corrida, ajusta la latencia."
      >
        <div className="flex flex-wrap items-center gap-3">
          {!armed ? (
            <Button variant="primary" onClick={arm}>
              Activar microfono
            </Button>
          ) : (
            <Button variant={recording ? "danger" : "record"} onClick={recording ? stop : start}>
              {recording ? "Parar toma" : "Grabar toma"}
            </Button>
          )}

          {armed && (
            <>
              <div className="w-40">
                <Meter value={level} />
              </div>
              <Button active={monitor} onClick={toggleMonitor} title="Solo con auriculares">
                Escucha directa
              </Button>
            </>
          )}

          <label className="flex flex-col gap-1 text-[10px] tracking-[0.16em] text-neutral-500 uppercase">
            Latencia {settings.latencyMs} ms
            <input
              type="range"
              min={0}
              max={250}
              step={1}
              value={settings.latencyMs}
              onChange={(e) => patch({ latencyMs: Number(e.target.value) })}
              className="w-40 accent-lime-400"
            />
          </label>
        </div>

        {monitor && (
          <p className="mt-3 text-xs text-amber-400">
            La escucha directa devuelve tu voz por la salida: usa auriculares o entrara en
            acople.
          </p>
        )}

        {error && (
          <p className="mt-3 rounded-lg border border-red-900 bg-red-950/50 px-3 py-2 text-sm text-red-300">
            {error}
          </p>
        )}
      </Panel>

      {takes.length === 0 ? (
        <p className="rounded-xl border border-dashed border-neutral-800 px-4 py-8 text-center text-sm text-neutral-600">
          Todavia no hay tomas. Dale a grabar y suelta un verso encima del beat.
        </p>
      ) : (
        <div className="space-y-4">
          {takes.map((take) => (
            <TakeCard key={take.id} take={take} />
          ))}
        </div>
      )}
    </div>
  );
}
