"use client";

import { useState, type FormEvent } from "react";

export function LandingLeadForm({ slug, ctaLabel }: { slug: string; ctaLabel: string }) {
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSubmitting(true);
    const form = new FormData(e.currentTarget);

    const res = await fetch(`/api/public/leads/${encodeURIComponent(slug)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: form.get("name"),
        phone: form.get("phone"),
        email: form.get("email") || undefined,
      }),
    });

    setSubmitting(false);
    if (res.ok) setSubmitted(true);
  }

  if (submitted) {
    return (
      <p className="text-center text-slate-700">
        ¡Gracias! Te contactaremos muy pronto para confirmar tu consulta.
      </p>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <input
        name="name"
        required
        placeholder="Nombre completo"
        className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900"
      />
      <input
        name="phone"
        required
        placeholder="WhatsApp / teléfono"
        className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900"
      />
      <input
        name="email"
        type="email"
        placeholder="Email (opcional)"
        className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900"
      />
      <button
        type="submit"
        disabled={submitting}
        className="w-full rounded-md bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-50"
      >
        {submitting ? "Enviando..." : ctaLabel}
      </button>
      <p className="text-[11px] text-slate-400">
        Al enviar este formulario aceptas que usemos tus datos para contactarte sobre tu consulta.
      </p>
    </form>
  );
}
