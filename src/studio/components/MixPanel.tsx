import { useState } from "react";
import { engine } from "@/studio/audio/engine";
import { downloadBlob, encodeWav, renderMix } from "@/studio/audio/mixdown";
import { useStudio } from "@/studio/state/useStudio";
import { Button, Panel, Stat } from "./ui";

function slug(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

/** Mezcla y exporta: renderiza el tema fuera de tiempo real y lo baja en WAV. */
export function MixPanel() {
  const { settings, pattern, takes, sections } = useStudio();
  const [busy, setBusy] = useState<string | null>(null);
  const [title, setTitle] = useState("tema");
  const [error, setError] = useState<string | null>(null);

  const barSeconds = (60 / settings.bpm) * 4;
  const longest = takes.reduce(
    (max, take) => Math.max(max, Math.max(0, take.offset) + take.buffer.duration),
    0
  );
  const structureBars = sections.reduce((sum, section) => sum + section.bars, 0);

  const exportMix = async (includeBeat: boolean, onlyBeat: boolean) => {
    setError(null);
    setBusy(onlyBeat ? "beat" : "mix");
    try {
      await engine.ensureContext();
      const buffer = await renderMix({
        pattern,
        takes: onlyBeat ? [] : takes,
        settings,
        includeBeat,
      });
      downloadBlob(encodeWav(buffer), `${slug(title) || "tema"}-${onlyBeat ? "beat" : "mezcla"}.wav`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo renderizar la mezcla");
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="space-y-4">
      <Panel
        title="Mezcla y exportacion"
        hint="El render se hace fuera de tiempo real: sale igual de limpio aunque tu ordenador vaya justo."
      >
        <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Stat label="Tempo" value={`${settings.bpm} BPM`} />
          <Stat label="Bucle" value={`${settings.bars} comp.`} />
          <Stat label="Tomas" value={String(takes.length)} />
          <Stat
            label="Duracion"
            value={`${Math.max(longest, structureBars * barSeconds).toFixed(1)} s`}
          />
        </div>

        <div className="mb-4 flex flex-wrap items-end gap-3">
          <label className="flex flex-col gap-1">
            <span className="text-[10px] tracking-[0.16em] text-neutral-500 uppercase">
              Nombre del archivo
            </span>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm"
            />
          </label>

          <Button
            variant="primary"
            disabled={busy !== null || takes.length === 0}
            onClick={() => exportMix(true, false)}
          >
            {busy === "mix" ? "Renderizando…" : "Exportar mezcla WAV"}
          </Button>
          <Button disabled={busy !== null} onClick={() => exportMix(true, true)}>
            {busy === "beat" ? "Renderizando…" : "Solo el beat"}
          </Button>
        </div>

        {takes.length === 0 && (
          <p className="text-sm text-neutral-600">
            Sin tomas grabadas solo se puede exportar el beat.
          </p>
        )}
        {error && (
          <p className="mt-3 rounded-lg border border-red-900 bg-red-950/50 px-3 py-2 text-sm text-red-300">
            {error}
          </p>
        )}
      </Panel>

      <Panel title="Niveles" hint="Ajuste rapido de los tres buses antes de exportar.">
        <div className="grid gap-4 sm:grid-cols-3">
          {(
            [
              ["beat", "Beat"],
              ["take", "Voces"],
              ["master", "Master"],
            ] as const
          ).map(([bus, label]) => (
            <label key={bus} className="flex flex-col gap-1">
              <span className="text-[10px] tracking-[0.16em] text-neutral-500 uppercase">
                {label}
              </span>
              <input
                type="range"
                min={0}
                max={1.4}
                step={0.01}
                defaultValue={bus === "master" ? 0.9 : bus === "beat" ? 0.85 : 1}
                onChange={(e) => engine.setBusGain(bus, Number(e.target.value))}
                className="accent-lime-400"
              />
            </label>
          ))}
        </div>
        <p className="mt-3 text-xs text-neutral-600">
          Estos niveles afectan a la escucha; la exportacion usa los volumenes de cada toma.
        </p>
      </Panel>

      <Panel title="Aviso" hint="">
        <p className="text-sm text-neutral-400">
          Las tomas viven en memoria mientras la pestaña este abierta. El tempo, el patron y la
          letra si se guardan solos en este navegador. Exporta el WAV antes de cerrar si quieres
          conservar la voz.
        </p>
      </Panel>
    </div>
  );
}
