import type { Category } from "@/lib/data/places";

/**
 * Placeholder de foto con intención visual — no un bloque gris "roto". Reemplazar por
 * `place.photo` real (Supabase Storage) cuando exista fotografía de negocios, ver
 * docs/panama-ai/09-mvp.md. El tinte varía por categoría para que una grilla de tarjetas
 * tenga ritmo visual (como una cuadrícula de fotos reales de lugares distintos) en vez de
 * verse repetitiva — no es decoración al azar, cada categoría tiene su propio tono
 * consistente en toda la app.
 */
const CATEGORY_TINT: Record<Category, string> = {
  beach: "from-sky-100 to-cyan-200/60",
  restaurant: "from-amber-100 to-orange-200/50",
  rooftop: "from-orange-100 to-rose-200/50",
  nightlife: "from-fuchsia-100 to-purple-200/50",
  museum: "from-violet-100 to-stone-200/60",
  tour: "from-emerald-100 to-teal-200/50",
  hotel: "from-yellow-100 to-amber-200/50",
  family: "from-lime-100 to-emerald-200/50",
};

export function PlacePhoto({
  category,
  className = "",
}: {
  category?: Category;
  className?: string;
}) {
  const tint = category ? CATEGORY_TINT[category] : "from-stone-100 to-accent-soft/60";

  return (
    <div className={`flex items-center justify-center bg-gradient-to-br ${tint} ${className}`} aria-hidden>
      <svg width="30" height="30" viewBox="0 0 24 24" fill="none" className="text-ink/25">
        <path
          d="M4 16.5 8.5 11l3 3.5L14 11l6 7"
          stroke="currentColor"
          strokeWidth="1.4"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <circle cx="8" cy="8" r="1.6" fill="currentColor" />
        <rect x="3" y="4" width="18" height="16" rx="2.5" stroke="currentColor" strokeWidth="1.4" />
      </svg>
    </div>
  );
}
