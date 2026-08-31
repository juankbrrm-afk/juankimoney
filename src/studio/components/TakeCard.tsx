import { useMemo, useState } from "react";
import clsx from "clsx";
import type { Take } from "@/studio/types";
import { detectOnsets } from "@/studio/analysis/onsets";
import { analyzeFlow } from "@/studio/analysis/flow";
import { analyzePitch, midiToName, NOTE_NAMES } from "@/studio/analysis/pitch";
import type { PitchAnalysis } from "@/studio/analysis/pitch";
import { useStudio } from "@/studio/state/useStudio";
import { engine } from "@/studio/audio/engine";
import { quantizeVocal } from "@/studio/audio/quantizeVocal";
import type { QuantizeMode } from "@/studio/audio/quantizeVocal";
import { FLOW_TEMPLATES } from "@/studio/lyrics/flowMap";
import { Button, Stat } from "./ui";
import { Waveform } from "./Waveform";

/**
 * Una toma con su analisis: donde cae cada silaba respecto a la rejilla, si
 * empujas o arrastras, y en que tono estas cantando.
 */
export function TakeCard({ take }: { take: Take }) {
  const { settings, updateTake, removeTake, addTake, stepSeconds } = useStudio();
  const [pitch, setPitch] = useState<PitchAnalysis | null>(null);
  const [pitchBusy, setPitchBusy] = useState(false);
  const [mode, setMode] = useState<QuantizeMode>("rejilla");
  const [strength, setStrength] = useState(1);
  const [fixing, setFixing] = useState(false);

  const onsets = useMemo(() => detectOnsets(take.buffer, { minGap: 0.07 }), [take.buffer]);

  const report = useMemo(
    () =>
      analyzeFlow(onsets, take.buffer.duration, {
        bpm: settings.bpm,
        stepsPerBar: settings.stepsPerBar,
        takeOffset: take.offset,
      }),
    [onsets, take.buffer.duration, take.offset, settings.bpm, settings.stepsPerBar]
  );

  const markers = useMemo(
    () =>
      onsets.map((onset, index) => {
        const deviation = Math.abs(report.markers[index]?.deviationMs ?? 0);
        return {
          time: onset.time,
          color: deviation <= 30 ? "#a3e635" : deviation <= 60 ? "#fbbf24" : "#f87171",
        };
      }),
    [onsets, report]
  );

  // Retoque manual sobre la alineacion que se calculo al grabar.
  const nudgeMs = Math.round((take.offset - take.baseOffset) * 1000);

  // La rejilla se dibuja donde cae respecto al inicio de esta toma.
  const gridOffset = ((-take.offset % stepSeconds) + stepSeconds) % stepSeconds;

  /**
   * Cuadrar la toma: corta por las silabas y las mueve a la rejilla (o a los
   * huecos del patron de flow). La toma original no se toca, sale una nueva.
   */
  const cuadrar = async () => {
    if (!onsets.length) return;
    setFixing(true);
    try {
      const ctx = await engine.ensureContext();
      const result = quantizeVocal(ctx, take.buffer, onsets, {
        bpm: settings.bpm,
        stepsPerBar: settings.stepsPerBar,
        takeOffset: take.offset,
        strength,
        mode,
        template: FLOW_TEMPLATES.find((t) => t.id === settings.flowTemplateId),
      });
      if (!result) return;
      addTake({
        id: `t${Date.now()}`,
        name: `${take.name} · cuadrada`,
        buffer: result.buffer,
        offset: take.offset,
        baseOffset: take.baseOffset,
        gain: take.gain,
        muted: false,
        soloed: false,
        createdAt: Date.now(),
      });
      updateTake(take.id, { muted: true });
    } finally {
      setFixing(false);
    }
  };

  const runPitch = () => {
    setPitchBusy(true);
    // Cede un frame para que el boton pinte el estado antes de bloquear.
    setTimeout(() => {
      setPitch(analyzePitch(take.buffer));
      setPitchBusy(false);
    }, 16);
  };

  return (
    <article className="rounded-xl border border-neutral-800 bg-neutral-950/50 p-4">
      <header className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <input
            value={take.name}
            onChange={(e) => updateTake(take.id, { name: e.target.value })}
            className="rounded border border-transparent bg-transparent px-1 py-0.5 text-sm font-semibold text-neutral-100 hover:border-neutral-700 focus:border-neutral-600 focus:outline-none"
          />
          <span className="text-xs text-neutral-500 tabular-nums">
            {take.buffer.duration.toFixed(1)}s
          </span>
        </div>
        <div className="flex items-center gap-2">
          <Button
            active={take.muted}
            onClick={() => updateTake(take.id, { muted: !take.muted })}
            className="px-2 py-1 text-xs"
          >
            M
          </Button>
          <Button
            active={take.soloed}
            onClick={() => updateTake(take.id, { soloed: !take.soloed })}
            className="px-2 py-1 text-xs"
          >
            S
          </Button>
          <Button
            variant="danger"
            onClick={() => removeTake(take.id)}
            className="px-2 py-1 text-xs"
          >
            Borrar
          </Button>
        </div>
      </header>

      <Waveform buffer={take.buffer} markers={markers} gridSeconds={stepSeconds} gridOffset={gridOffset} />

      <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <label className="flex flex-col gap-1 text-[10px] tracking-[0.16em] text-neutral-500 uppercase">
          Volumen
          <input
            type="range"
            min={0}
            max={1.5}
            step={0.01}
            value={take.gain}
            onChange={(e) => updateTake(take.id, { gain: Number(e.target.value) })}
            className="accent-lime-400"
          />
        </label>
        <label className="flex flex-col gap-1 text-[10px] tracking-[0.16em] text-neutral-500 uppercase">
          Ajuste {nudgeMs > 0 ? "+" : ""}
          {nudgeMs} ms
          <input
            type="range"
            min={-300}
            max={300}
            step={1}
            value={nudgeMs}
            onChange={(e) =>
              updateTake(take.id, { offset: take.baseOffset + Number(e.target.value) / 1000 })
            }
            className="accent-lime-400"
          />
        </label>
        <Stat
          label="Pocket"
          value={`${Math.round(report.pocket * 100)}%`}
          tone={report.pocket > 0.75 ? "good" : report.pocket > 0.5 ? "warn" : "bad"}
        />
        <Stat
          label={report.pushPullMs < 0 ? "Adelanto" : "Retraso"}
          value={`${Math.abs(Math.round(report.pushPullMs))} ms`}
          tone={Math.abs(report.pushPullMs) < 18 ? "good" : "warn"}
        />
      </div>

      <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Silabas/compas" value={report.syllablesPerBar.toFixed(1)} />
        <Stat label="Dispersion" value={`${Math.round(report.spreadMs)} ms`} />
        <Stat label="Contratiempo" value={`${Math.round(report.offbeatRatio * 100)}%`} />
        <Stat label="Ataques" value={String(report.markers.length)} />
      </div>

      <div className="mt-3 rounded-lg border border-neutral-800 bg-neutral-900/60 p-3">
        <p className="text-sm font-semibold text-neutral-100">{report.verdict}</p>
        <ul className="mt-2 space-y-1 text-sm text-neutral-400">
          {report.tips.map((tip) => (
            <li key={tip} className="flex gap-2">
              <span className="text-lime-500">→</span>
              {tip}
            </li>
          ))}
        </ul>
      </div>

      <div className="mt-3 rounded-lg border border-lime-900/60 bg-lime-950/20 p-3">
        <p className="text-sm font-semibold text-lime-300">Cuadrar mi voz al beat</p>
        <p className="mt-1 text-sm text-neutral-400">
          Corta la toma por cada sílaba y las coloca en su sitio. Tu voz, tu tono, tu timbre —
          solo cambia cuándo entra cada sílaba. La toma original se queda intacta.
        </p>
        <div className="mt-3 flex flex-wrap items-end gap-3">
          <div className="flex gap-2">
            <Button
              active={mode === "rejilla"}
              onClick={() => setMode("rejilla")}
              className="px-2 py-1 text-xs"
            >
              A la rejilla
            </Button>
            <Button
              active={mode === "flow"}
              onClick={() => setMode("flow")}
              className="px-2 py-1 text-xs"
            >
              Al patrón de flow
            </Button>
          </div>
          <label className="flex flex-col gap-1 text-[10px] tracking-[0.16em] text-neutral-500 uppercase">
            Fuerza {Math.round(strength * 100)}%
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={strength}
              onChange={(e) => setStrength(Number(e.target.value))}
              className="w-32 accent-lime-400"
            />
          </label>
          <Button variant="primary" onClick={cuadrar} disabled={fixing || !onsets.length}>
            {fixing ? "Cuadrando…" : "Cuadrar"}
          </Button>
        </div>
        <p className="mt-2 text-xs text-neutral-600">
          {mode === "rejilla"
            ? "Cada sílaba va a la semicorchea más cercana: arregla el timing sin cambiar tu flow."
            : `Cada sílaba va a un hueco del patrón "${FLOW_TEMPLATES.find((t) => t.id === settings.flowTemplateId)?.name ?? ""}": te impone ese flow.`}
        </p>
      </div>

      <div className="mt-3">
        <div className="mb-2 flex h-12 items-end gap-1">
          {report.gridHistogram.map((value, index) => (
            <div
              key={index}
              className={clsx(
                "flex-1 rounded-sm",
                index % 4 === 0 ? "bg-lime-400" : "bg-neutral-600"
              )}
              style={{ height: `${Math.max(3, value * 48)}px` }}
              title={`Semicorchea ${index + 1}`}
            />
          ))}
        </div>
        <p className="text-xs text-neutral-600">
          Huella del flow: en que semicorcheas del compas caen tus silabas.
        </p>
      </div>

      <div className="mt-3">
        {pitch ? (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Stat
              label="Tonalidad"
              value={
                pitch.key ? `${NOTE_NAMES[pitch.key.root]} ${pitch.key.mode}` : "—"
              }
            />
            <Stat
              label="Nota central"
              value={pitch.medianMidi === null ? "—" : midiToName(pitch.medianMidi)}
            />
            <Stat
              label="Rango"
              value={
                pitch.lowestMidi === null || pitch.highestMidi === null
                  ? "—"
                  : `${midiToName(pitch.lowestMidi)}–${midiToName(pitch.highestMidi)}`
              }
            />
            <Stat
              label="Afinacion"
              value={
                pitch.averageCentsOff === null
                  ? "—"
                  : `±${Math.round(pitch.averageCentsOff)} cents`
              }
              tone={
                pitch.averageCentsOff !== null && pitch.averageCentsOff < 25 ? "good" : "warn"
              }
            />
          </div>
        ) : (
          <Button onClick={runPitch} disabled={pitchBusy}>
            {pitchBusy ? "Analizando tono…" : "Analizar tono y tonalidad"}
          </Button>
        )}
      </div>
    </article>
  );
}
