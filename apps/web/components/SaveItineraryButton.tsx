"use client";

import { useState } from "react";
import type { ItineraryStop } from "@/lib/ai/tools";

export function SaveItineraryButton({ stops }: { stops: ItineraryStop[] }) {
  const [state, setState] = useState<"idle" | "saving" | "done" | "error">("idle");
  const [url, setUrl] = useState<string | null>(null);

  async function save() {
    setState("saving");
    try {
      const res = await fetch("/api/itineraries", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ placeIds: stops.map((s) => s.place.id) }),
      });
      if (!res.ok) throw new Error("save failed");
      const { id } = (await res.json()) as { id: string };
      setUrl(`${window.location.origin}/itinerarios/${id}`);
      setState("done");
    } catch {
      setState("error");
    }
  }

  if (state === "done" && url) {
    return (
      <div className="mt-2 flex items-center gap-2 text-xs">
        <input readOnly value={url} className="flex-1 rounded-full border border-stone-200 px-3 py-1.5 text-stone-600" />
        <button
          type="button"
          onClick={() => navigator.clipboard.writeText(url)}
          className="rounded-full bg-accent px-3 py-1.5 font-medium text-white"
        >
          Copiar
        </button>
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={save}
      disabled={state === "saving"}
      className="mt-2 rounded-full border border-stone-200 px-3 py-1.5 text-xs font-medium text-ink hover:border-accent hover:text-accent disabled:opacity-50"
    >
      {state === "saving" ? "Guardando…" : state === "error" ? "Intentar de nuevo" : "Guardar y compartir"}
    </button>
  );
}
