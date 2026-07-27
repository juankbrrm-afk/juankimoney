import { notFound } from "next/navigation";
import Link from "next/link";
import { findPlaceBySlug } from "@/lib/data/places";
import { MapEmbed } from "@/components/MapEmbed";
import { PlacePhoto } from "@/components/PlacePhoto";
import { ReviewForm } from "@/components/ReviewForm";
import { listReviewsForPlace } from "@/lib/reviews/store";

// Dinámico en vez de estático: la sección de reseñas cambia con cada envío y debe
// reflejarse de inmediato, igual que el dataset compartido con apps/admin — por eso ya
// no hay generateStaticParams, no tendría efecto junto a force-dynamic.
export const dynamic = "force-dynamic";

export default async function PlacePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const place = await findPlaceBySlug(slug);
  if (!place) notFound();

  const reviews = await listReviewsForPlace(place.id);

  const waLink = place.contacts.whatsapp
    ? `https://wa.me/${place.contacts.whatsapp.replace(/[^\d]/g, "")}`
    : null;
  const bookLink = waLink ?? place.contacts.website ?? null;
  const mapsLink = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
    `${place.name} ${place.zone} Panama`,
  )}`;

  return (
    <main className="mx-auto max-w-3xl px-4 py-10">
      <Link href="/" className="text-sm text-stone-600 hover:text-accent">
        ← Volver al concierge
      </Link>

      <PlacePhoto className="mt-4 aspect-[16/9] w-full rounded-2xl" />

      <div className="mt-6 flex items-center justify-between">
        <h1 className="font-display text-3xl text-ink">{place.name}</h1>
        <span className="text-sm text-stone-600">★ {place.avgRating.toFixed(1)}</span>
      </div>
      <p className="mt-1 text-stone-600">
        {place.zone} · {"$".repeat(place.priceLevel)}
      </p>

      <p className="mt-6 text-base leading-relaxed text-ink">{place.description}</p>

      <dl className="mt-6 grid grid-cols-2 gap-4 text-sm">
        <div>
          <dt className="text-stone-400">Horario</dt>
          <dd className="text-ink">{place.hours}</dd>
        </div>
        <div>
          <dt className="text-stone-400">Apto para niños</dt>
          <dd className="text-ink">{place.kidsFriendly ? "Sí" : "No"}</dd>
        </div>
      </dl>

      <div className="mt-8 flex gap-3">
        {bookLink ? (
          <a href={bookLink} target="_blank" rel="noreferrer" className="rounded-full bg-accent px-5 py-2.5 text-sm font-medium text-white">
            Reservar
          </a>
        ) : null}
        {place.contacts.phone ? (
          <a href={`tel:${place.contacts.phone}`} className="rounded-full border border-stone-200 px-5 py-2.5 text-sm font-medium text-ink">
            Llamar
          </a>
        ) : null}
        <a href={mapsLink} target="_blank" rel="noreferrer" className="rounded-full border border-stone-200 px-5 py-2.5 text-sm font-medium text-ink">
          Navegar
        </a>
      </div>

      <div className="mt-8">
        <MapEmbed query={`${place.name} ${place.zone} Panama`} />
      </div>

      <div className="mt-10">
        <h2 className="font-display text-xl text-ink">
          Reseñas {reviews.length > 0 ? `(${reviews.length})` : ""}
        </h2>

        {reviews.length > 0 ? (
          <ul className="mt-4 flex flex-col gap-4">
            {reviews.map((r) => (
              <li key={r.id} className="rounded-2xl border border-stone-200 bg-white p-4">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-medium text-ink">{r.authorName}</p>
                  <span className="text-xs text-accent">{"★".repeat(r.rating)}{"☆".repeat(5 - r.rating)}</span>
                </div>
                <p className="mt-2 text-sm text-stone-600">{r.body}</p>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-2 text-sm text-stone-400">Todavía no hay reseñas — sé el primero.</p>
        )}

        <div className="mt-5">
          <ReviewForm placeSlug={place.slug} />
        </div>
      </div>
    </main>
  );
}
