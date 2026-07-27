"use client";

import { QUICK_INTENT_PROMPTS } from "@/lib/ai/prompts";

export function QuickIntentPrompts({
  onPick,
  variant = "light",
}: {
  onPick: (prompt: string) => void;
  variant?: "light" | "dark";
}) {
  const chipClass =
    variant === "dark"
      ? "rounded-full border border-white/20 bg-white/10 px-4 py-2 text-sm text-white backdrop-blur-sm transition-colors hover:border-white/40 hover:bg-white/15"
      : "rounded-full border border-stone-200 bg-white px-4 py-2 text-sm text-ink transition-colors hover:border-accent hover:text-accent";

  return (
    <div className="flex flex-wrap gap-2">
      {QUICK_INTENT_PROMPTS.map((prompt) => (
        <button key={prompt} type="button" onClick={() => onPick(prompt)} className={chipClass}>
          {prompt}
        </button>
      ))}
    </div>
  );
}
