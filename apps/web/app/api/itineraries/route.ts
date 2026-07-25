import { saveItinerary } from "@/lib/itineraries/store";

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const placeIds = Array.isArray(body?.placeIds) ? (body.placeIds as string[]).filter((id) => typeof id === "string") : [];

  if (!placeIds.length) {
    return Response.json({ error: "placeIds no puede estar vacío." }, { status: 400 });
  }
  if (placeIds.length > 30) {
    return Response.json({ error: "Demasiadas paradas." }, { status: 400 });
  }

  const itinerary = await saveItinerary({
    title: typeof body?.title === "string" ? body.title : undefined,
    placeIds,
    hoursAvailable: typeof body?.hoursAvailable === "number" ? body.hoursAvailable : undefined,
    budgetUsd: typeof body?.budgetUsd === "number" ? body.budgetUsd : undefined,
  });

  return Response.json({ id: itinerary.id });
}
