"use client";

import { QUICK_INTENT_PROMPTS } from "@/lib/ai/prompts";

export function QuickIntentPrompts({ onPick }: { onPick: (prompt: string) => void }) {
  return (
    <div className="flex flex-wrap gap-2">
      {QUICK_INTENT_PROMPTS.map((prompt) => (
        <button
          key={prompt}
          type="button"
          onClick={() => onPick(prompt)}
          className="rounded-full border border-stone-200 bg-white px-4 py-2 text-sm text-ink transition-colors hover:border-accent hover:text-accent"
        >
          {prompt}
        </button>
      ))}
    </div>
  );
}
