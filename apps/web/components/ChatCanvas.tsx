"use client";

import { useState } from "react";
import type { Place } from "@/lib/data/places";
import type { ItineraryStop } from "@/lib/ai/tools";
import type { StreamEvent as ChatStreamEvent } from "@/lib/ai/orchestrator";
import { PlaceCard } from "@/components/PlaceCard";
import { ItineraryTimeline } from "@/components/ItineraryTimeline";
import { QuickIntentPrompts } from "@/components/QuickIntentPrompts";
import { SaveItineraryButton } from "@/components/SaveItineraryButton";

interface DisplayMessage {
  role: "user" | "assistant";
  content: string;
  places?: Place[];
  itinerary?: ItineraryStop[] | null;
  mode?: "live" | "demo";
}

export function ChatCanvas() {
  const [messages, setMessages] = useState<DisplayMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function send(text: string) {
    const trimmed = text.trim();
    if (!trimmed || loading) return;

    setError(null);
    const nextMessages: DisplayMessage[] = [...messages, { role: "user", content: trimmed }];
    setMessages([...nextMessages, { role: "assistant", content: "" }]);
    setInput("");
    setLoading(true);

    const assistantIndex = nextMessages.length;

    function patchAssistant(patch: Partial<DisplayMessage>) {
      setMessages((prev) => {
        const copy = [...prev];
        const current = copy[assistantIndex];
        if (!current) return prev;
        copy[assistantIndex] = { ...current, ...patch };
        return copy;
      });
    }

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: trimmed,
          history: nextMessages.map((m) => ({ role: m.role, content: m.content })),
        }),
      });

      if (!res.ok || !res.body) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.error ?? "Error de red");
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let text = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          if (!line.trim()) continue;
          const event = JSON.parse(line) as ChatStreamEvent;

          if (event.type === "mode") patchAssistant({ mode: event.mode });
          else if (event.type === "text-delta") {
            text += event.text;
            patchAssistant({ content: text });
          } else if (event.type === "places") patchAssistant({ places: event.places });
          else if (event.type === "itinerary") patchAssistant({ itinerary: event.stops });
          else if (event.type === "error") setError(event.message);
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Algo salió mal");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      {messages.length === 0 && (
        <div>
          <p className="mb-3 text-sm text-stone-600">Prueba con algo como:</p>
          <QuickIntentPrompts onPick={send} />
        </div>
      )}

      <div className="flex flex-col gap-5">
        {messages.map((m, i) => (
          <div key={i} className={m.role === "user" ? "self-end" : "self-start w-full"}>
            {m.role === "user" ? (
              <div className="max-w-md rounded-2xl bg-ink px-4 py-2.5 text-sm text-white">{m.content}</div>
            ) : (
              <div className="w-full">
                {m.mode === "demo" && (
                  <p className="mb-2 inline-block rounded-full bg-accent-soft px-3 py-1 text-xs font-medium text-accent-strong">
                    Modo demo — sin ANTHROPIC_API_KEY configurada
                  </p>
                )}
                <p className="max-w-2xl whitespace-pre-wrap text-sm leading-relaxed text-ink">
                  {m.content}
                  {loading && i === messages.length - 1 && <span className="animate-pulse">▍</span>}
                </p>
                {m.places && m.places.length > 0 && (
                  <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    {m.places.map((p) => (
                      <PlaceCard key={p.id} place={p} />
                    ))}
                  </div>
                )}
                {m.itinerary && m.itinerary.length > 0 && (
                  <div className="mt-4 max-w-md">
                    <ItineraryTimeline stops={m.itinerary} />
                    <SaveItineraryButton stops={m.itinerary} />
                  </div>
                )}
              </div>
            )}
          </div>
        ))}
        {error && <p className="text-sm text-red-600">{error}</p>}
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          send(input);
        }}
        className="sticky bottom-4 flex items-center gap-2 rounded-full border border-stone-200 bg-white p-2 shadow-sm"
      >
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Cuéntame de tu viaje… ej: tengo hambre y voy con niños"
          className="flex-1 rounded-full bg-transparent px-3 py-2 text-sm outline-none"
        />
        <button
          type="submit"
          disabled={loading || !input.trim()}
          className="rounded-full bg-accent px-5 py-2 text-sm font-medium text-white disabled:opacity-40"
        >
          Enviar
        </button>
      </form>
    </div>
  );
}
