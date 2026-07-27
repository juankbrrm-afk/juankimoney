import { promises as fs } from "node:fs";
import path from "node:path";

/**
 * Lee el dataset compartido en /data/places.json (ver /data/README.md) — la misma fuente
 * que edita apps/admin. Se relee en cada llamada (nada de cache en memoria) para que un
 * cambio guardado en el dashboard se refleje de inmediato en el concierge, sin reiniciar
 * el servidor. A este volumen de filas (decenas, no miles) el costo de releer el archivo
 * es insignificante; cuando esto se reemplace por Supabase, este es el único archivo que
 * cambia — ver el comentario de `loadPlaces` abajo.
 */

export type Category =
  | "restaurant"
  | "rooftop"
  | "beach"
  | "hotel"
  | "tour"
  | "nightlife"
  | "museum"
  | "family";

export type PlaceStatus = "draft" | "published" | "archived";

export interface Place {
  id: string;
  slug: string;
  name: string;
  category: Category;
  zone: string;
  priceLevel: 1 | 2 | 3 | 4;
  description: string;
  tags: string[];
  hours: string;
  kidsFriendly: boolean;
  avgRating: number;
  status: PlaceStatus;
  contacts: {
    phone?: string;
    whatsapp?: string;
    instagram?: string;
    website?: string;
  };
  photo: string;
  /** Aproximadas (conocimiento general de la ubicación, no geocodificadas) — ver MapView.tsx. */
  coordinates?: { lat: number; lng: number };
}

const DATA_PATH = path.join(process.cwd(), "..", "..", "data", "places.json");

/**
 * Punto único de acceso a lugares. El resto del código (`lib/ai/tools.ts`,
 * `app/lugares/[slug]/page.tsx`) nunca lee el JSON directo — así, cuando esto se conecte
 * a Supabase, solo se reescribe esta función (ej. `supabase.from('places').select()`),
 * nada de los call sites cambia.
 */
export async function loadPlaces(): Promise<Place[]> {
  const raw = await fs.readFile(DATA_PATH, "utf-8");
  return JSON.parse(raw) as Place[];
}

/** Solo lugares publicados — nunca se le muestra al usuario un borrador o algo archivado. */
export async function loadPublishedPlaces(): Promise<Place[]> {
  const places = await loadPlaces();
  return places.filter((p) => p.status === "published");
}

export async function findPlaceBySlug(slug: string): Promise<Place | undefined> {
  const places = await loadPlaces();
  return places.find((p) => p.slug === slug && p.status === "published");
}
