"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function ReviewForm({ placeSlug }: { placeSlug: string }) {
  const router = useRouter();
  const [rating, setRating] = useState(5);
  const [body, setBody] = useState("");
  const [authorName, setAuthorName] = useState("");
  const [state, setState] = useState<"idle" | "saving" | "error">("idle");
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setState("saving");
    setError(null);
    try {
      const res = await fetch("/api/reviews", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ placeSlug, rating, body, authorName: authorName || undefined }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setError(data?.error ?? "No se pudo guardar la reseña.");
        setState("error");
        return;
      }
      setBody("");
      setAuthorName("");
      setState("idle");
      router.refresh();
    } catch {
      setError("Error de red.");
      setState("error");
    }
  }

  return (
    <form onSubmit={submit} className="rounded-2xl border border-stone-200 bg-white p-4">
      <p className="mb-3 text-sm font-medium text-ink">Deja tu reseña</p>

      <div className="mb-3 flex gap-1">
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
            onClick={() => setRating(n)}
            aria-label={`${n} estrellas`}
            className={`text-xl leading-none ${n <= rating ? "text-accent" : "text-stone-200"}`}
          >
            ★
          </button>
        ))}
      </div>

      <textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        required
        minLength={5}
        maxLength={1000}
        rows={3}
        placeholder="¿Qué tal estuvo?"
        className="mb-3 w-full rounded-xl border border-stone-200 px-3 py-2 text-sm outline-none focus:border-accent"
      />

      <input
        value={authorName}
        onChange={(e) => setAuthorName(e.target.value)}
        placeholder="Tu nombre (opcional)"
        className="mb-3 w-full rounded-xl border border-stone-200 px-3 py-2 text-sm outline-none focus:border-accent"
      />

      {error && <p className="mb-3 text-xs text-red-600">{error}</p>}

      <button
        type="submit"
        disabled={state === "saving"}
        className="rounded-full bg-accent px-5 py-2 text-sm font-medium text-white disabled:opacity-50"
      >
        {state === "saving" ? "Enviando…" : "Publicar reseña"}
      </button>
    </form>
  );
}
