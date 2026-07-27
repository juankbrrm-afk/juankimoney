import { addReview } from "@/lib/reviews/store";
import { findPlaceBySlug } from "@/lib/data/places";

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const placeSlug = typeof body?.placeSlug === "string" ? body.placeSlug : "";
  const rating = Number(body?.rating);
  const text = typeof body?.body === "string" ? body.body.trim() : "";

  if (!placeSlug) return Response.json({ error: "Falta el lugar." }, { status: 400 });
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
    return Response.json({ error: "El rating debe ser un entero de 1 a 5." }, { status: 400 });
  }
  if (!text || text.length < 5) {
    return Response.json({ error: "Escribe un poco más — mínimo 5 caracteres." }, { status: 400 });
  }

  const place = await findPlaceBySlug(placeSlug);
  if (!place) return Response.json({ error: "Ese lugar no existe o no está publicado." }, { status: 404 });

  try {
    const review = await addReview({
      placeId: place.id,
      rating,
      body: text,
      authorName: typeof body?.authorName === "string" ? body.authorName : undefined,
    });
    return Response.json({ id: review.id });
  } catch (err) {
    console.error("addReview failed", err);
    return Response.json(
      { error: "No se pudo guardar la reseña en este entorno (requiere Supabase conectado, ver docs/panama-ai)." },
      { status: 501 },
    );
  }
}
