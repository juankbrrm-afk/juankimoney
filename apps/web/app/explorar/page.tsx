import Link from "next/link";
import type { Metadata } from "next";
import { loadPublishedPlaces, type Category } from "@/lib/data/places";
import { CATEGORIES, CATEGORY_LABEL } from "@/lib/categories";
import { PlaceCard } from "@/components/PlaceCard";

export const metadata: Metadata = {
  title: "Explorar Panamá — Panama AI",
  description: "Restaurantes, hoteles, tours, playas y vida nocturna verificados en Panamá, sin necesidad de chatear.",
};

function isCategory(value: string | undefined): value is Category {
  return Boolean(value) && CATEGORIES.some((c) => c.value === value);
}

export default async function ExplorarPage({
  searchParams,
}: {
  searchParams: Promise<{ categoria?: string; zona?: string }>;
}) {
  const { categoria, zona } = await searchParams;
  const places = await loadPublishedPlaces();

  const zones = Array.from(new Set(places.map((p) => p.zone))).sort();

  const filtered = places.filter((p) => {
    if (isCategory(categoria) && p.category !== categoria) return false;
    if (zona && p.zone !== zona) return false;
    return true;
  });

  function buildHref(next: { categoria?: string; zona?: string }) {
    const params = new URLSearchParams();
    const c = next.categoria !== undefined ? next.categoria : categoria;
    const z = next.zona !== undefined ? next.zona : zona;
    if (c) params.set("categoria", c);
    if (z) params.set("zona", z);
    const qs = params.toString();
    return qs ? `/explorar?${qs}` : "/explorar";
  }

  return (
    <main className="mx-auto max-w-5xl px-4 py-10 sm:py-16">
      <p className="text-xs font-medium uppercase tracking-widest text-accent">Panama AI</p>
      <h1 className="mt-2 font-display text-3xl text-ink sm:text-4xl">Explorar Panamá</h1>
      <p className="mt-3 max-w-2xl text-stone-600">
        Navega el catálogo verificado directamente, sin conversar con el concierge. Útil para
        comparar opciones o cuando ya sabes exactamente qué buscas.
      </p>

      <div className="mt-8 flex flex-wrap gap-2">
        <Link
          href={buildHref({ categoria: undefined })}
          className={`rounded-full border px-4 py-2 text-sm ${
            !categoria ? "border-accent bg-accent-soft text-accent-strong" : "border-stone-200 text-ink hover:border-accent"
          }`}
        >
          Todas
        </Link>
        {CATEGORIES.map((c) => (
          <Link
            key={c.value}
            href={buildHref({ categoria: c.value })}
            className={`rounded-full border px-4 py-2 text-sm ${
              categoria === c.value
                ? "border-accent bg-accent-soft text-accent-strong"
                : "border-stone-200 text-ink hover:border-accent"
            }`}
          >
            {c.label}
          </Link>
        ))}
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        <Link
          href={buildHref({ zona: undefined })}
          className={`rounded-full px-3 py-1.5 text-xs ${
            !zona ? "font-medium text-accent" : "text-stone-600 hover:text-accent"
          }`}
        >
          Todas las zonas
        </Link>
        {zones.map((z) => (
          <Link
            key={z}
            href={buildHref({ zona: z })}
            className={`rounded-full px-3 py-1.5 text-xs ${
              zona === z ? "font-medium text-accent" : "text-stone-600 hover:text-accent"
            }`}
          >
            {z}
          </Link>
        ))}
      </div>

      <p className="mt-6 text-sm text-stone-600">
        {filtered.length} {filtered.length === 1 ? "lugar" : "lugares"}
        {categoria && isCategory(categoria) ? ` en ${CATEGORY_LABEL[categoria]}` : ""}
        {zona ? ` · ${zona}` : ""}
      </p>

      {filtered.length > 0 ? (
        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((p) => (
            <PlaceCard key={p.id} place={p} />
          ))}
        </div>
      ) : (
        <p className="mt-8 text-sm text-stone-400">Nada por aquí todavía con esos filtros.</p>
      )}

      <Link href="/" className="mt-10 inline-block text-sm text-stone-600 hover:text-accent">
        ← Prefiero contarle al concierge lo que busco
      </Link>
    </main>
  );
}
