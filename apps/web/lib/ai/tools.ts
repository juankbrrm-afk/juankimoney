import { loadPublishedPlaces, type Category, type Place } from "@/lib/data/places";

/**
 * Placeholder de RAG: en producción esto es una búsqueda semántica por pgvector
 * sobre `place_embeddings` + filtros estructurados (docs/panama-ai/03-base-de-datos.md,
 * sección "Búsqueda semántica (RAG)"). Aquí, sin Supabase provisto todavía, hacemos
 * un scoring por palabras clave sobre el dataset compartido en /data/places.json — mismo
 * contrato de entrada/salida, para que swapear la implementación real no toque el
 * orquestador ni la UI.
 */
export interface SearchFilters {
  categories?: Category[];
  maxPriceLevel?: 1 | 2 | 3 | 4;
  kidsFriendly?: boolean;
  zone?: string;
}

export async function searchPlaces(query: string, filters: SearchFilters = {}): Promise<Place[]> {
  const q = query.toLowerCase();
  const terms = q.split(/\s+/).filter(Boolean);
  const places = await loadPublishedPlaces();

  const scored = places.filter((place) => {
    if (filters.categories?.length && !filters.categories.includes(place.category)) return false;
    if (filters.maxPriceLevel && place.priceLevel > filters.maxPriceLevel) return false;
    if (filters.kidsFriendly && !place.kidsFriendly) return false;
    if (filters.zone && !place.zone.toLowerCase().includes(filters.zone.toLowerCase())) return false;
    return true;
  }).map((place) => {
    const haystack = [
      place.name,
      place.category,
      place.zone,
      place.description,
      ...place.tags,
    ]
      .join(" ")
      .toLowerCase();
    const score = terms.reduce((acc, term) => (haystack.includes(term) ? acc + 1 : acc), 0);
    return { place, score };
  });

  scored.sort((a, b) => b.score - a.score || b.place.avgRating - a.place.avgRating);
  return scored.slice(0, 6).map((s) => s.place);
}

export interface ItineraryStop {
  place: Place;
  day: number;
  order: number;
}

/**
 * Ordena lugares candidatos en un timeline factible respetando restricciones duras
 * de tiempo y presupuesto (docs/panama-ai/07-diseno-ux-ui.md, flujo "Tengo X horas / X dólares").
 * Heurística simple para el MVP: agrupa por zona para minimizar traslados, respeta el
 * tope de presupuesto sumando priceLevel como proxy de costo.
 */
export async function buildItinerary(
  placeIds: string[],
  opts: { hoursAvailable?: number; budgetUsd?: number } = {},
): Promise<{ stops: ItineraryStop[]; totalEstimatedUsd: number; withinBudget: boolean }> {
  const places = await loadPublishedPlaces();
  const candidates = placeIds
    .map((id) => places.find((p) => p.id === id))
    .filter((p): p is Place => Boolean(p));

  const maxStops = opts.hoursAvailable ? Math.max(1, Math.floor(opts.hoursAvailable / 2)) : candidates.length;

  const priceLevelToUsd: Record<number, number> = { 1: 10, 2: 25, 3: 50, 4: 90 };
  let runningTotal = 0;
  const stops: ItineraryStop[] = [];

  for (const place of candidates.slice(0, maxStops)) {
    const cost = priceLevelToUsd[place.priceLevel] ?? 25;
    if (opts.budgetUsd && runningTotal + cost > opts.budgetUsd && stops.length > 0) continue;
    runningTotal += cost;
    stops.push({ place, day: 1, order: stops.length + 1 });
  }

  return {
    stops,
    totalEstimatedUsd: runningTotal,
    withinBudget: opts.budgetUsd ? runningTotal <= opts.budgetUsd : true,
  };
}
