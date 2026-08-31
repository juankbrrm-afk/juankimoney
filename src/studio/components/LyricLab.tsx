import { useMemo, useState } from "react";
import clsx from "clsx";
import { engine } from "@/studio/audio/engine";
import { useStudio } from "@/studio/state/useStudio";
import { analyzeLyrics } from "@/studio/lyrics/analyze";
import { buildBank } from "@/studio/lyrics/rhymeBank";
import { findRhymes } from "@/studio/lyrics/rhyme";
import type { RhymeType } from "@/studio/lyrics/rhyme";
import { FLOW_TEMPLATES, placeSyllables } from "@/studio/lyrics/flowMap";
import { SECTION_KINDS, SONG_TEMPLATES } from "@/studio/lyrics/structure";
import { Button, Field, Panel, Stat } from "./ui";

const TYPE_STYLES: Record<RhymeType, string> = {
  consonante: "border-lime-500 text-lime-300",
  asonante: "border-sky-500 text-sky-300",
  cercana: "border-neutral-600 text-neutral-400",
};

/**
 * Cuaderno de letra: cuenta silabas con sinalefa, saca el esquema de rima,
 * busca rimas en castellano y reparte el verso sobre la rejilla para que puedas
 * oir el flow antes de grabarlo.
 */
export function LyricLab() {
  const { sections, setSections, updateSection, addSection, removeSection, settings, patch } =
    useStudio();
  const [selected, setSelected] = useState<{ section: string; line: number } | null>(null);
  const [rhymeWord, setRhymeWord] = useState("");
  const [rhymeType, setRhymeType] = useState<RhymeType>("cercana");
  const [templateId, setTemplateId] = useState(settings.flowTemplateId);

  const analyses = useMemo(
    () => new Map(sections.map((section) => [section.id, analyzeLyrics(section.lyrics)])),
    [sections]
  );

  const vocabulary = useMemo(
    () => Array.from(new Set([...analyses.values()].flatMap((a) => a.vocabulary))),
    [analyses]
  );

  const rhymes = useMemo(() => {
    const word = rhymeWord.trim();
    if (word.length < 2) return [];
    return findRhymes(word, buildBank(vocabulary), { minType: rhymeType, limit: 48 });
  }, [rhymeWord, rhymeType, vocabulary]);

  const template = FLOW_TEMPLATES.find((t) => t.id === templateId) ?? FLOW_TEMPLATES[0];

  const selectedLine = useMemo(() => {
    if (!selected) return null;
    const analysis = analyses.get(selected.section);
    return analysis?.lines[selected.line] ?? null;
  }, [selected, analyses]);

  const placement = useMemo(
    () => (selectedLine ? placeSyllables(selectedLine.syllables, template) : []),
    [selectedLine, template]
  );
  const lineBars = Math.max(1, Math.ceil(((placement.at(-1)?.step ?? 0) + 1) / 16));

  const totalBars = sections.reduce((sum, section) => sum + section.bars, 0);
  const songSeconds = totalBars * ((60 / settings.bpm) * 4);

  const applyTemplate = (id: string) => {
    const found = SONG_TEMPLATES.find((t) => t.id === id);
    if (!found) return;
    const hasLyrics = sections.some((s) => s.lyrics.trim().length > 0);
    if (hasLyrics && !window.confirm("Esto reemplaza la estructura actual. La letra escrita se perdera. ¿Seguimos?")) {
      return;
    }
    setSections(
      found.sections.map((section, index) => ({
        id: `s${Date.now()}_${index}`,
        kind: section.kind,
        bars: section.bars,
        lyrics: "",
      }))
    );
  };

  const insertWord = (word: string) => {
    if (!selected) return;
    const section = sections.find((s) => s.id === selected.section);
    if (!section) return;
    const lines = section.lyrics.split("\n");
    const current = lines[selected.line] ?? "";
    lines[selected.line] = current.trim() ? `${current.trimEnd()} ${word}` : word;
    updateSection(section.id, { lyrics: lines.join("\n") });
  };

  const rehearse = async () => {
    if (!placement.length) return;
    const steps = Array.from(
      new Set(placement.map((p) => p.step % (settings.stepsPerBar * settings.bars)))
    );
    patch({ guideSteps: steps, flowTemplateId: template.id });
    engine.update({ guideSteps: steps });
    if (!engine.isPlaying) await engine.play();
  };

  const stopRehearsal = () => {
    patch({ guideSteps: [] });
    engine.update({ guideSteps: [] });
    engine.stop();
  };

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
      <div className="space-y-4">
        <Panel
          title="Estructura"
          hint={`${totalBars} compases · ${Math.floor(songSeconds / 60)}:${String(Math.round(songSeconds % 60)).padStart(2, "0")} a ${settings.bpm} BPM`}
          actions={
            <select
              defaultValue=""
              onChange={(e) => {
                applyTemplate(e.target.value);
                e.target.value = "";
              }}
              className="rounded-lg border border-neutral-700 bg-neutral-900 px-2 py-1.5 text-sm"
            >
              <option value="">Plantilla…</option>
              {SONG_TEMPLATES.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          }
        >
          <div className="space-y-4">
            {sections.map((section) => {
              const analysis = analyses.get(section.id);
              return (
                <div key={section.id} className="rounded-lg border border-neutral-800 bg-neutral-950/50 p-3">
                  <div className="mb-2 flex flex-wrap items-center gap-2">
                    <select
                      value={SECTION_KINDS.includes(section.kind as (typeof SECTION_KINDS)[number]) ? section.kind : "Verso"}
                      onChange={(e) => updateSection(section.id, { kind: e.target.value })}
                      className="rounded border border-neutral-700 bg-neutral-900 px-2 py-1 text-sm"
                    >
                      {SECTION_KINDS.map((kind) => (
                        <option key={kind}>{kind}</option>
                      ))}
                    </select>
                    <input
                      type="number"
                      min={1}
                      max={64}
                      value={section.bars}
                      onChange={(e) => updateSection(section.id, { bars: Number(e.target.value) || 1 })}
                      className="w-16 rounded border border-neutral-700 bg-neutral-900 px-2 py-1 text-sm tabular-nums"
                    />
                    <span className="text-xs text-neutral-600">compases</span>
                    {analysis && analysis.target > 0 && (
                      <span className="text-xs text-neutral-600">
                        medida de referencia: {analysis.target} silabas
                      </span>
                    )}
                    <Button
                      variant="danger"
                      onClick={() => removeSection(section.id)}
                      className="ml-auto px-2 py-1 text-xs"
                    >
                      Quitar
                    </Button>
                  </div>

                  <textarea
                    value={section.lyrics}
                    onChange={(e) => updateSection(section.id, { lyrics: e.target.value })}
                    onSelect={(e) => {
                      const area = e.currentTarget;
                      const line = area.value.slice(0, area.selectionStart).split("\n").length - 1;
                      setSelected({ section: section.id, line });
                      const words = (area.value.split("\n")[line] ?? "").trim().split(/\s+/);
                      const last = words[words.length - 1];
                      if (last) setRhymeWord(last);
                    }}
                    rows={Math.max(4, section.lyrics.split("\n").length + 1)}
                    placeholder="Escribe aqui. Cada linea es un verso."
                    className="w-full resize-y rounded-lg border border-neutral-800 bg-neutral-900 p-3 font-mono text-sm leading-7 text-neutral-100 focus:border-neutral-600 focus:outline-none"
                  />

                  {analysis && analysis.lines.some((l) => l.metrics.count > 0) && (
                    <ul className="mt-2 space-y-0.5 font-mono text-xs">
                      {analysis.lines.map((line) => {
                        if (!line.text.trim()) return null;
                        const off = analysis.target > 0 ? line.metrics.count - analysis.target : 0;
                        return (
                          <li
                            key={line.index}
                            className={clsx(
                              "flex items-baseline gap-2 rounded px-1 py-0.5",
                              selected?.section === section.id && selected.line === line.index
                                ? "bg-neutral-800"
                                : ""
                            )}
                          >
                            <button
                              type="button"
                              onClick={() => {
                                setSelected({ section: section.id, line: line.index });
                                if (line.metrics.lastWord) setRhymeWord(line.metrics.lastWord);
                              }}
                              className="flex-1 truncate text-left text-neutral-500 hover:text-neutral-200"
                            >
                              {line.text}
                            </button>
                            <span
                              className={clsx(
                                "w-10 shrink-0 text-right tabular-nums",
                                off === 0
                                  ? "text-neutral-500"
                                  : Math.abs(off) <= 1
                                    ? "text-amber-400"
                                    : "text-red-400"
                              )}
                              title={`${line.metrics.count} silabas (${line.metrics.rawCount} sin sinalefa)`}
                            >
                              {line.metrics.count}
                              {off > 0 ? "+" : off < 0 ? "−" : ""}
                            </span>
                            <span
                              className={clsx(
                                "w-4 shrink-0 text-center",
                                line.rhymeLabel === "-" ? "text-neutral-700" : "text-lime-400"
                              )}
                            >
                              {line.rhymeLabel}
                            </span>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </div>
              );
            })}

            <Button onClick={addSection}>Añadir bloque</Button>
          </div>
        </Panel>
      </div>

      <div className="space-y-4">
        <Panel title="Rimas" hint="Busca por la ultima palabra del verso. Pincha una para meterla en la linea seleccionada.">
          <div className="space-y-3">
            <Field label="Palabra">
              <input
                value={rhymeWord}
                onChange={(e) => setRhymeWord(e.target.value)}
                placeholder="p. ej. camino"
                className="w-full rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm"
              />
            </Field>
            <div className="flex gap-2">
              {(["consonante", "asonante", "cercana"] as const).map((type) => (
                <Button
                  key={type}
                  active={rhymeType === type}
                  onClick={() => setRhymeType(type)}
                  className="px-2 py-1 text-xs capitalize"
                >
                  {type}
                </Button>
              ))}
            </div>
            <div className="flex flex-wrap gap-1.5">
              {rhymes.length === 0 && rhymeWord.trim().length > 1 && (
                <p className="text-sm text-neutral-600">
                  Nada en el banco. Prueba con rima asonante o cercana.
                </p>
              )}
              {rhymes.map((match) => (
                <button
                  key={match.word}
                  type="button"
                  onClick={() => insertWord(match.word)}
                  className={clsx(
                    "rounded-full border px-2.5 py-1 text-xs transition-colors hover:bg-neutral-800",
                    TYPE_STYLES[match.type]
                  )}
                  title={`Rima ${match.type} · ${match.syllableCount} silabas`}
                >
                  {match.word}
                </button>
              ))}
            </div>
          </div>
        </Panel>

        <Panel title="Flow" hint="Elige un patron y mira donde cae cada silaba del verso seleccionado.">
          <div className="space-y-3">
            <Field label="Patron">
              <select
                value={template.id}
                onChange={(e) => setTemplateId(e.target.value)}
                className="w-full rounded-lg border border-neutral-700 bg-neutral-900 px-2 py-2 text-sm"
              >
                {FLOW_TEMPLATES.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            </Field>
            <p className="text-sm text-neutral-500">{template.description}</p>

            {selectedLine && selectedLine.syllables.length > 0 ? (
              <>
                <div className="grid grid-cols-2 gap-2">
                  <Stat label="Silabas" value={String(selectedLine.metrics.count)} />
                  <Stat label="Compases" value={String(lineBars)} />
                </div>

                {/* Un compas por fila: el verso se lee de golpe sin barrer de lado. */}
                <div className="space-y-2">
                  {Array.from({ length: lineBars }, (_, bar) => (
                    <div key={bar} className="flex items-start gap-0.5">
                      <span className="w-4 shrink-0 pt-2 text-[10px] text-neutral-600 tabular-nums">
                        {bar + 1}
                      </span>
                      {Array.from({ length: 16 }, (_, offset) => {
                        const step = bar * 16 + offset;
                        const hit = placement.find((p) => p.step === step);
                        return (
                          <div key={offset} className="min-w-0 flex-1 text-center">
                            <div
                              className={clsx(
                                "h-7 rounded-sm border",
                                hit
                                  ? "border-lime-300 bg-lime-400/90"
                                  : offset % 4 === 0
                                    ? "border-neutral-700 bg-neutral-800"
                                    : "border-neutral-800 bg-neutral-900"
                              )}
                            />
                            <div className="mt-0.5 truncate text-[8px] text-neutral-500">
                              {hit?.syllable ?? ""}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ))}
                </div>

                <div className="flex gap-2">
                  <Button variant="primary" onClick={rehearse}>
                    Ensayar con el beat
                  </Button>
                  <Button onClick={stopRehearsal}>Parar guia</Button>
                </div>
              </>
            ) : (
              <p className="text-sm text-neutral-600">
                Selecciona un verso en la letra para repartirlo sobre la rejilla.
              </p>
            )}
          </div>
        </Panel>
      </div>
    </div>
  );
}
