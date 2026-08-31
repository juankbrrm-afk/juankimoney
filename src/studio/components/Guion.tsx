import { useEffect, useMemo, useRef } from "react";
import clsx from "clsx";
import { useStudio, useTransport } from "@/studio/state/useStudio";
import { measureLine } from "@/studio/lyrics/syllables";
import { suggestTemplateId, templateName } from "@/studio/lyrics/arrange";
import { Panel } from "./ui";

interface GuionLine {
  key: string;
  bar: number;
  kind: string;
  first: boolean;
  text: string;
  syllables: number;
  flow: string;
}

/**
 * El guion de la cancion: que se dice en cada compas. Mientras suena el beat se
 * ilumina el verso que toca, asi que sirve de teleprompter para grabar.
 */
export function Guion() {
  const { sections, barSeconds } = useStudio();
  const { playing, position } = useTransport();
  const activeRef = useRef<HTMLLIElement>(null);

  const lines = useMemo(() => {
    const out: GuionLine[] = [];
    let bar = 0;
    for (const section of sections) {
      const texts = section.lyrics.split("\n").map((l) => l.trim());
      const written = texts.filter(Boolean);
      const start = bar;
      written.forEach((text, index) => {
        const metrics = measureLine(text);
        out.push({
          key: `${section.id}_${index}`,
          bar: start + index,
          kind: section.kind,
          first: index === 0,
          text,
          syllables: metrics.count,
          flow: templateName(suggestTemplateId(metrics.count)),
        });
      });
      if (!written.length) {
        out.push({
          key: `${section.id}_empty`,
          bar: start,
          kind: section.kind,
          first: true,
          text: "—",
          syllables: 0,
          flow: "",
        });
      }
      bar = start + section.bars;
    }
    return out;
  }, [sections]);

  const currentBar = playing && position >= 0 ? Math.floor(position / barSeconds) : -1;
  const activeIndex = lines.findIndex(
    (line, index) =>
      currentBar >= line.bar && (index + 1 >= lines.length || currentBar < lines[index + 1].bar)
  );

  useEffect(() => {
    activeRef.current?.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [activeIndex]);

  const totalBars = sections.reduce((sum, section) => sum + section.bars, 0);

  if (!lines.length) {
    return (
      <Panel title="Guion" hint="">
        <p className="text-sm text-neutral-500">
          Todavia no hay letra. Pegala en la pestaña Letra y dale a "Ordenar como cancion".
        </p>
      </Panel>
    );
  }

  return (
    <Panel
      title="Guion"
      hint={`${totalBars} compases. Dale al play y se va iluminando el verso que toca: puedes grabar leyendo de aqui.`}
    >
      <ol className="space-y-1">
        {lines.map((line, index) => (
          <li
            key={line.key}
            ref={index === activeIndex ? activeRef : null}
            className={clsx(
              "rounded-lg px-3 py-2 transition-colors",
              index === activeIndex ? "bg-lime-400 text-neutral-950" : "bg-neutral-950/40"
            )}
          >
            {line.first && (
              <div
                className={clsx(
                  "mb-1 text-[10px] font-semibold tracking-[0.18em] uppercase",
                  index === activeIndex ? "text-neutral-800" : "text-neutral-500"
                )}
              >
                {line.kind}
              </div>
            )}
            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <span
                className={clsx(
                  "w-7 shrink-0 text-xs tabular-nums",
                  index === activeIndex ? "text-neutral-700" : "text-neutral-600"
                )}
              >
                {line.bar + 1}
              </span>
              <span className="flex-1 text-base leading-6">{line.text}</span>
              <span
                className={clsx(
                  "w-full shrink-0 pl-10 text-xs tabular-nums sm:w-auto sm:pl-0",
                  index === activeIndex ? "text-neutral-700" : "text-neutral-600"
                )}
              >
                {line.syllables} síl · {line.flow}
              </span>
            </div>
          </li>
        ))}
      </ol>
    </Panel>
  );
}
