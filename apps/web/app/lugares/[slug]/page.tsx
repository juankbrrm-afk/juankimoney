import { notFound } from "next/navigation";
import Link from "next/link";
import { findPlaceBySlug, PLACES } from "@/lib/data/places";

export function generateStaticParams() {
  return PLACES.map((p) => ({ slug: p.slug }));
}

export default async function PlacePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const place = findPlaceBySlug(slug);
  if (!place) notFound();

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

      <div className="mt-4 aspect-[16/9] w-full rounded-2xl bg-stone-100" aria-hidden />

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
    </main>
  );
}
