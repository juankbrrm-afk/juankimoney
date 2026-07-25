import { promises as fs } from "node:fs";
import path from "node:path";
import { randomBytes } from "node:crypto";

/**
 * Persistencia de itinerarios compartibles por link (docs/panama-ai/09-mvp.md: "guardar/
 * compartir itinerario por link sin necesidad de cuenta"). Stand-in de las tablas
 * `itineraries`/`itinerary_items` (docs/panama-ai/03-base-de-datos.md) — guarda solo
 * referencias a `placeId`, no una copia de los datos del lugar, para que un lugar editado
 * en apps/admin se refleje también en itinerarios ya guardados. Archivo fuera de git
 * (data/itineraries.json es contenido generado por usuarios, no dataset semilla curado).
 */

export interface SavedItinerary {
  id: string;
  title: string;
  placeIds: string[];
  hoursAvailable?: number;
  budgetUsd?: number;
  createdAt: string;
}

const DATA_PATH = path.join(process.cwd(), "..", "..", "data", "itineraries.json");

async function readAll(): Promise<SavedItinerary[]> {
  try {
    const raw = await fs.readFile(DATA_PATH, "utf-8");
    return JSON.parse(raw) as SavedItinerary[];
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw err;
  }
}

async function writeAll(itineraries: SavedItinerary[]): Promise<void> {
  await fs.mkdir(path.dirname(DATA_PATH), { recursive: true });
  await fs.writeFile(DATA_PATH, JSON.stringify(itineraries, null, 2) + "\n", "utf-8");
}

export async function saveItinerary(input: {
  title?: string;
  placeIds: string[];
  hoursAvailable?: number;
  budgetUsd?: number;
}): Promise<SavedItinerary> {
  const itineraries = await readAll();
  const itinerary: SavedItinerary = {
    id: randomBytes(6).toString("hex"),
    title: input.title?.trim() || "Mi viaje a Panamá",
    placeIds: input.placeIds,
    hoursAvailable: input.hoursAvailable,
    budgetUsd: input.budgetUsd,
    createdAt: new Date().toISOString(),
  };
  itineraries.push(itinerary);
  await writeAll(itineraries);
  return itinerary;
}

export async function getItinerary(id: string): Promise<SavedItinerary | undefined> {
  const itineraries = await readAll();
  return itineraries.find((i) => i.id === id);
}
