import { useCallback, useMemo, useRef, useState } from "react";
import { engine } from "@/studio/audio/engine";
import { recorder } from "@/studio/audio/recorder";
import { importAudioFile, isFramed, micErrorMessage } from "@/studio/audio/importAudio";
import { detectOnsets } from "@/studio/analysis/onsets";
import { estimateTempo, findPhase } from "@/studio/analysis/tempo";
import { beatboxToPattern } from "@/studio/analysis/beatbox";
import type { BeatboxResult } from "@/studio/analysis/beatbox";
import { VOICE_LABELS } from "@/studio/types";
import { useStudio } from "@/studio/state/useStudio";
import { useMicLevel } from "@/studio/state/useMicLevel";
import { Button, Meter, Panel, Stat } from "./ui";
import { Waveform } from "./Waveform";
import { MicError } from "./MicError";

const VOICE_COLORS: Record<string, string> = {
  kick: "#f97316",
  snare: "#38bdf8",
  hat: "#e879f9",
};

interface Analysis {
  buffer: AudioBuffer;
  result: BeatboxResult;
  bpm: number;
  offset: number;
  confidence: number | null;
}

/**
 * Ritmo con la voz: grabas el beat con la boca y el sistema lo convierte en
 * patron. Saca el tempo de tus propios golpes, clasifica cada uno por su timbre
 * (grave = bombo, medio = caja, agudo = hi-hat) y lo cuadra en la rejilla.
 */
export function BeatboxPanel() {
  const { settings, patch, setPattern } = useStudio();
  const [recording, setRecording] = useState(false);
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [error, setError] = useState<{ message: string; raw?: unknown } | null>(null);
  const [useOwnTempo, setUseOwnTempo] = useState(true);
  const fileInput = useRef<HTMLInputElement>(null);
  const [withClick, setWithClick] = useState(false);
  const level = useMicLevel(recording);

  /** Analiza un beatbox, venga del microfono o de un archivo. */
  const analizar = useCallback(
    (buffer: AudioBuffer, anchor: number | null, startTime: number) => {
      const onsets = detectOnsets(buffer, { minGap: 0.06 });
      if (onsets.length < 3) {
        setError({ message: "Se detectaron muy pocos golpes. Marca el ritmo mas fuerte y separado." });
        return;
      }

      let bpm = settings.bpm;
      let offset: number;
      let confidence: number | null = null;

      if (anchor !== null && !useOwnTempo) {
        // Grabado contra el click: el compas 1 ya se sabe donde cae.
        offset = anchor - startTime;
        while (offset < 0) offset += (60 / bpm) * 4;
      } else if (useOwnTempo) {
        const tempo = estimateTempo(onsets, buffer.duration);
        if (!tempo) {
          setError({ message: "No se pudo sacar el tempo. Prueba a marcar el pulso mas regular." });
          return;
        }
        bpm = Math.round(tempo.bpm);
        confidence = tempo.confidence;
        offset = tempo.offset;
      } else {
        offset = findPhase(onsets, 60 / bpm, buffer.duration);
      }

      const result = beatboxToPattern(onsets, buffer.duration, {
        bpm,
        offset,
        stepsPerBar: settings.stepsPerBar,
        bars: settings.bars,
      });

      setAnalysis({ buffer, result, bpm, offset: result.downbeat, confidence });
      setError(null);
    },
    [settings.bpm, settings.stepsPerBar, settings.bars, useOwnTempo]
  );

  const importar = useCallback(
    async (file: File) => {
      setError(null);
      try {
        const ctx = await engine.ensureContext();
        const { buffer } = await importAudioFile(ctx, file);
        analizar(buffer, null, 0);
      } catch {
        setError({ message: "No se pudo leer ese archivo de audio. Prueba con un m4a, mp3 o wav." });
      }
    },
    [analizar]
  );

  const start = useCallback(async () => {
    setError(null);
    // Igual que al grabar una toma: el permiso se pide antes de cualquier await.
    const request = recorder.requestStream();
    engine.unlock();
    try {
      await request;
      const ctx = await engine.ensureContext();
      await recorder.arm(ctx, engine.master!);
      if (withClick) {
        engine.update({ beatEnabled: false, metronome: true });
        await engine.play();
      }
      recorder.start();
      setRecording(true);
    } catch (err) {
      setError({ message: micErrorMessage(err), raw: err });
    }
  }, [withClick]);

  const stop = useCallback(() => {
    const recorded = recorder.stop();
    setRecording(false);
    const anchor = engine.isPlaying ? engine.anchorTime : null;
    if (withClick) engine.stop();
    if (!recorded) {
      setError({ message: "No llego audio. Revisa el microfono." });
      return;
    }
    analizar(recorded.buffer, anchor, recorded.startTime);
  }, [withClick, analizar]);

  const apply = useCallback(() => {
    if (!analysis) return;
    if (useOwnTempo) patch({ bpm: analysis.bpm });
    setPattern(analysis.result.pattern);
    setAnalysis(null);
  }, [analysis, patch, setPattern, useOwnTempo]);

  const markers = useMemo(
    () =>
      analysis?.result.hits.map((hit) => ({
        time: hit.time,
        color: VOICE_COLORS[hit.voice] ?? "#fff",
      })) ?? [],
    [analysis]
  );

  const counts = useMemo(() => {
    const tally = { kick: 0, snare: 0, hat: 0 };
    for (const hit of analysis?.result.hits ?? []) tally[hit.voice]++;
    return tally;
  }, [analysis]);

  const stepSeconds = analysis ? ((60 / analysis.bpm) * 4) / settings.stepsPerBar : undefined;

  return (
    <Panel
      title="Ritmo con tu voz"
      hint={
        isFramed()
          ? "Haz el beat con la boca — 'b' para el bombo, 'ts/pf' para la caja, 'ts' corto para el hi-hat — y se convierte en patron. Si el navegador no te deja abrir el microfono aqui, grabalo con la app de notas de voz e importa el archivo."
          : "Haz el beat con la boca — 'b' para el bombo, 'ts/pf' para la caja, 'ts' corto para el hi-hat — y se convierte en patron. Repite el mismo compas varias veces: cuantas mas vueltas, mas limpio sale."
      }
    >
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <Button variant={recording ? "danger" : "record"} onClick={recording ? stop : start}>
          {recording ? "Parar y analizar" : "Grabar beatbox"}
        </Button>
        <Button onClick={() => fileInput.current?.click()} disabled={recording}>
          Importar audio
        </Button>
        <input
          ref={fileInput}
          type="file"
          accept="audio/*"
          className="hidden"
          onChange={(event) => {
            const file = event.target.files?.[0];
            event.target.value = "";
            if (file) void importar(file);
          }}
        />
        <label className="flex items-center gap-2 text-sm text-neutral-400">
          <input
            type="checkbox"
            checked={useOwnTempo}
            onChange={(e) => setUseOwnTempo(e.target.checked)}
            className="accent-lime-400"
            disabled={recording}
          />
          Sacar el tempo de mi voz
        </label>
        <label className="flex items-center gap-2 text-sm text-neutral-400">
          <input
            type="checkbox"
            checked={withClick}
            onChange={(e) => setWithClick(e.target.checked)}
            className="accent-lime-400"
            disabled={recording || useOwnTempo}
          />
          Con click de guia
        </label>
        {recording && (
          <div className="w-40">
            <Meter value={level} />
          </div>
        )}
      </div>

      {error && (
        <div className="mb-3">
          <MicError message={error.message} error={error.raw} />
        </div>
      )}

      {analysis && stepSeconds && (
        <div className="space-y-4">
          <Waveform
            buffer={analysis.buffer}
            markers={markers}
            gridSeconds={stepSeconds}
            gridOffset={analysis.offset}
          />

          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <Stat label="Tempo" value={`${analysis.bpm} BPM`} />
            <Stat
              label="Fiabilidad"
              value={
                analysis.confidence === null ? "—" : `${Math.round(analysis.confidence * 100)}%`
              }
              tone={
                analysis.confidence === null
                  ? "neutral"
                  : analysis.confidence > 0.5
                    ? "good"
                    : "warn"
              }
            />
            <Stat label="Golpes" value={String(analysis.result.hits.length)} />
            <Stat label="Vueltas" value={String(analysis.result.loops)} />
          </div>

          <div className="flex flex-wrap gap-4 text-sm text-neutral-400">
            {(["kick", "snare", "hat"] as const).map((voice) => (
              <span key={voice} className="flex items-center gap-2">
                <span
                  className="inline-block h-2.5 w-2.5 rounded-full"
                  style={{ background: VOICE_COLORS[voice] }}
                />
                {VOICE_LABELS[voice]}: {counts[voice]}
              </span>
            ))}
          </div>

          <div className="flex gap-2">
            <Button variant="primary" onClick={apply}>
              Usar este ritmo
            </Button>
            <Button onClick={() => setAnalysis(null)}>Descartar</Button>
          </div>
        </div>
      )}
    </Panel>
  );
}
