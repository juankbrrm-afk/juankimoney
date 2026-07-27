import { promises as fs } from "node:fs";
import path from "node:path";
import { randomBytes } from "node:crypto";

/**
 * Stand-in de la tabla `reviews` (docs/panama-ai/03-base-de-datos.md), acotado a
 * `source = 'internal'` — las de `google_sync` llegan por integración, no por este store.
 * Igual que itineraries.json: contenido generado por usuarios, no dataset semilla, fuera
 * de git. No recalcula `avgRating` del lugar — ese campo sigue siendo el valor curado
 * editorialmente hasta que haya suficiente volumen real de reseñas para que tenga sentido
 * promediar (evita que una sola reseña de prueba distorsione el rating mostrado en todo
 * el catálogo).
 */

export interface Review {
  id: string;
  placeId: string;
  rating: 1 | 2 | 3 | 4 | 5;
  body: string;
  authorName: string;
  createdAt: string;
}

const DATA_PATH = path.join(process.cwd(), "..", "..", "data", "reviews.json");

async function readAll(): Promise<Review[]> {
  try {
    const raw = await fs.readFile(DATA_PATH, "utf-8");
    return JSON.parse(raw) as Review[];
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw err;
  }
}

async function writeAll(reviews: Review[]): Promise<void> {
  await fs.mkdir(path.dirname(DATA_PATH), { recursive: true });
  await fs.writeFile(DATA_PATH, JSON.stringify(reviews, null, 2) + "\n", "utf-8");
}

export async function listReviewsForPlace(placeId: string): Promise<Review[]> {
  const all = await readAll();
  return all.filter((r) => r.placeId === placeId).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function addReview(input: {
  placeId: string;
  rating: number;
  body: string;
  authorName?: string;
}): Promise<Review> {
  const reviews = await readAll();
  const review: Review = {
    id: randomBytes(6).toString("hex"),
    placeId: input.placeId,
    rating: Math.min(5, Math.max(1, Math.round(input.rating))) as Review["rating"],
    body: input.body.trim().slice(0, 1000),
    authorName: input.authorName?.trim().slice(0, 60) || "Viajero anónimo",
    createdAt: new Date().toISOString(),
  };
  reviews.push(review);
  await writeAll(reviews);
  return review;
}
