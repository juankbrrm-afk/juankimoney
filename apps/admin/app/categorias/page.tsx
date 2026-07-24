import { listPlaces } from "@/lib/store";
import { CATEGORIES } from "@/lib/types";

export default async function CategoriasPage() {
  const places = await listPlaces();
  const counts = Object.fromEntries(CATEGORIES.map((c) => [c.value, 0])) as Record<string, number>;
  for (const place of places) counts[place.category] = (counts[place.category] ?? 0) + 1;

  return (
    <div>
      <h1 className="mb-1 text-xl font-semibold text-ink">Categorías</h1>
      <p className="mb-6 text-sm text-stone-600">
        En este corte las categorías son un catálogo fijo (docs/panama-ai/03-base-de-datos.md las
        modela como tabla editable — CRUD completo llega cuando este dashboard se conecte a Supabase).
      </p>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        {CATEGORIES.map((c) => (
          <div key={c.value} className="rounded-2xl border border-stone-200 bg-white p-4">
            <p className="text-sm font-medium text-ink">{c.label}</p>
            <p className="mt-1 text-2xl font-semibold text-accent">{counts[c.value]}</p>
            <p className="text-xs text-stone-600">lugares</p>
          </div>
        ))}
      </div>
    </div>
  );
}
