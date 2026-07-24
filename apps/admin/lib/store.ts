import { promises as fs } from "node:fs";
import path from "node:path";
import type { Place } from "@/lib/types";

/**
 * Store de desarrollo respaldado por un archivo JSON — stand-in de la tabla `places`
 * de Supabase (docs/panama-ai/03-base-de-datos.md) hasta que este dashboard se conecte
 * a un proyecto real. La forma de estas funciones (read/write async, un Place a la vez)
 * es intencionalmente la misma que tendrá el cliente de Supabase, para que migrar sea
 * cambiar la implementación de este archivo, no los call sites en app/negocios/*.
 *
 * Apunta a /data/places.json en la raíz del repo — el mismo archivo que lee apps/web —
 * para que un negocio editado aquí se refleje de inmediato en el concierge (ver /data/README.md).
 */

const DATA_PATH = path.join(process.cwd(), "..", "..", "data", "places.json");

export async function listPlaces(): Promise<Place[]> {
  const raw = await fs.readFile(DATA_PATH, "utf-8");
  return JSON.parse(raw) as Place[];
}

export async function getPlace(id: string): Promise<Place | undefined> {
  const places = await listPlaces();
  return places.find((p) => p.id === id);
}

async function writePlaces(places: Place[]): Promise<void> {
  await fs.writeFile(DATA_PATH, JSON.stringify(places, null, 2) + "\n", "utf-8");
}

export async function createPlace(input: Omit<Place, "id">): Promise<Place> {
  const places = await listPlaces();
  const place: Place = { ...input, id: `p${Date.now()}` };
  places.push(place);
  await writePlaces(places);
  return place;
}

export async function updatePlace(id: string, input: Omit<Place, "id">): Promise<void> {
  const places = await listPlaces();
  const index = places.findIndex((p) => p.id === id);
  if (index === -1) throw new Error(`No existe el lugar ${id}`);
  places[index] = { ...input, id };
  await writePlaces(places);
}

export async function deletePlace(id: string): Promise<void> {
  const places = await listPlaces();
  await writePlaces(places.filter((p) => p.id !== id));
}

export function slugify(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}
