"use client";

import { useState } from "react";
import type { ItineraryStop } from "@/lib/ai/tools";

export function SaveItineraryButton({ stops }: { stops: ItineraryStop[] }) {
  const [state, setState] = useState<"idle" | "saving" | "done" | "error">("idle");
  const [url, setUrl] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  async function save() {
    setState("saving");
    try {
      const res = await fetch("/api/itineraries", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ placeIds: stops.map((s) => s.place.id) }),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) {
        setErrorMessage(body?.error ?? "No se pudo guardar.");
        setState("error");
        return;
      }
      setUrl(`${window.location.origin}/itinerarios/${body.id}`);
      setState("done");
    } catch {
      setErrorMessage("Error de red.");
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
    <div className="mt-2">
      <button
        type="button"
        onClick={save}
        disabled={state === "saving"}
        className="rounded-full border border-stone-200 px-3 py-1.5 text-xs font-medium text-ink hover:border-accent hover:text-accent disabled:opacity-50"
      >
        {state === "saving" ? "Guardando…" : state === "error" ? "Intentar de nuevo" : "Guardar y compartir"}
      </button>
      {state === "error" && errorMessage && <p className="mt-1 text-xs text-stone-400">{errorMessage}</p>}
    </div>
  );
}
