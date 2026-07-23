import { useState, type ReactNode } from "react";
import clsx from "clsx";

interface AccordionItem {
  title: string;
  content: ReactNode;
}

export function Accordion({ items }: { items: AccordionItem[] }) {
  const [open, setOpen] = useState<number | null>(null);

  return (
    <div className="border-t border-black/10">
      {items.map((item, i) => {
        const expanded = open === i;
        return (
          <div key={item.title} className="border-b border-black/10">
            <button
              type="button"
              data-cursor-hover
              onClick={() => setOpen(expanded ? null : i)}
              className="flex w-full items-center justify-between py-5 text-left text-sm font-semibold tracking-tight"
            >
              {item.title}
              <span
                className={clsx(
                  "text-lg font-normal text-warmgray transition-transform duration-500 ease-out",
                  expanded && "rotate-45"
                )}
              >
                +
              </span>
            </button>
            <div
              className="grid overflow-hidden transition-[grid-template-rows] duration-500 ease-out"
              style={{ gridTemplateRows: expanded ? "1fr" : "0fr" }}
            >
              <div className="min-h-0 overflow-hidden">
                <p className="pb-6 text-sm leading-relaxed text-warmgray">
                  {item.content}
                </p>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
