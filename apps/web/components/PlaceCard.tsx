import Link from "next/link";
import type { Place } from "@/lib/data/places";
import { CATEGORY_LABEL } from "@/lib/categories";
import { PlacePhoto } from "@/components/PlacePhoto";

export function PlaceCard({ place }: { place: Place }) {
  const priceTag = "$".repeat(place.priceLevel);
  const waLink = place.contacts.whatsapp
    ? `https://wa.me/${place.contacts.whatsapp.replace(/[^\d]/g, "")}`
    : null;
  const bookLink = waLink ?? place.contacts.website ?? null;
  const mapsLink = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
    `${place.name} ${place.zone} Panama`,
  )}`;

  return (
    <div className="group flex flex-col overflow-hidden rounded-2xl border border-stone-200 bg-white transition-shadow hover:shadow-[0_8px_28px_-14px_rgba(23,24,26,0.25)]">
      <Link href={`/lugares/${place.slug}`} className="block">
        <PlacePhoto className="aspect-[4/3] w-full transition-transform duration-300 group-hover:scale-[1.02]" />
        <div className="p-4 pb-2">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-medium uppercase tracking-wide text-accent">
              {CATEGORY_LABEL[place.category]}
            </span>
            <span className="text-xs text-stone-600">{priceTag}</span>
          </div>
          <h3 className="mt-1 font-display text-lg leading-tight text-ink">{place.name}</h3>
          <p className="mt-1 text-sm text-stone-600">
            {place.zone} · ★ {place.avgRating.toFixed(1)}
          </p>
        </div>
      </Link>
      <div className="mt-auto flex gap-1.5 border-t border-stone-200 p-3">
        {bookLink ? (
          <a
            href={bookLink}
            target="_blank"
            rel="noreferrer"
            className="flex-1 rounded-full bg-accent px-2 py-2 text-center text-xs font-medium text-white"
          >
            Reservar
          </a>
        ) : (
          <span className="flex-1 rounded-full bg-stone-100 px-2 py-2 text-center text-xs text-stone-400">
            Reservar
          </span>
        )}
        {place.contacts.phone ? (
          <a
            href={`tel:${place.contacts.phone}`}
            className="flex-1 rounded-full border border-stone-200 px-2 py-2 text-center text-xs font-medium text-ink"
          >
            Llamar
          </a>
        ) : (
          <span className="flex-1 rounded-full bg-stone-100 px-2 py-2 text-center text-xs text-stone-400">
            Llamar
          </span>
        )}
        <a
          href={mapsLink}
          target="_blank"
          rel="noreferrer"
          className="flex-1 rounded-full border border-stone-200 px-2 py-2 text-center text-xs font-medium text-ink"
        >
          Navegar
        </a>
      </div>
    </div>
  );
}
