/**
 * Placeholder de foto con intención visual — no un bloque gris "roto". Reemplazar por
 * `place.photo` real (Supabase Storage) cuando exista fotografía de negocios, ver
 * docs/panama-ai/09-mvp.md.
 */
export function PlacePhoto({ className = "" }: { className?: string }) {
  return (
    <div
      className={`flex items-center justify-center bg-gradient-to-br from-stone-100 to-accent-soft/60 ${className}`}
      aria-hidden
    >
      <svg width="30" height="30" viewBox="0 0 24 24" fill="none" className="text-stone-400/70">
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
