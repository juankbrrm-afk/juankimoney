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

  try {
    const itinerary = await saveItinerary({
      title: typeof body?.title === "string" ? body.title : undefined,
      placeIds,
      hoursAvailable: typeof body?.hoursAvailable === "number" ? body.hoursAvailable : undefined,
      budgetUsd: typeof body?.budgetUsd === "number" ? body.budgetUsd : undefined,
    });
    return Response.json({ id: itinerary.id });
  } catch (err) {
    // lib/itineraries/store.ts escribe a disco — funciona en un servidor con filesystem
    // persistente, pero un despliegue serverless (ej. funciones de Vercel) monta el
    // filesystem como solo lectura y esto falla con EROFS. Falla explícito en vez de un
    // 500 críptico: guardar itinerarios de verdad requiere Supabase conectado
    // (docs/panama-ai/09-mvp.md), no está soportado sobre almacenamiento efímero.
    console.error("saveItinerary failed", err);
    return Response.json(
      { error: "No se pudo guardar el itinerario en este entorno (requiere Supabase conectado, ver docs/panama-ai)." },
      { status: 501 },
    );
  }
}
