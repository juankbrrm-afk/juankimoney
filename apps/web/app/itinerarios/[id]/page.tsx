import { notFound } from "next/navigation";
import Link from "next/link";
import type { Metadata } from "next";
import { getItinerary } from "@/lib/itineraries/store";
import { buildItinerary } from "@/lib/ai/tools";
import { PlaceCard } from "@/components/PlaceCard";
import { ItineraryTimeline } from "@/components/ItineraryTimeline";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const saved = await getItinerary(id);
  return { title: saved ? `${saved.title} — Panama AI` : "Itinerario — Panama AI" };
}

export default async function ItineraryPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const saved = await getItinerary(id);
  if (!saved) notFound();

  // Re-deriva el timeline a partir de los placeIds guardados contra el dataset actual —
  // si un lugar cambió de horario o fue archivado en apps/admin desde que se compartió este
  // link, quien lo abra ve el estado real, no una foto congelada del momento en que se guardó.
  const { stops, totalEstimatedUsd, withinBudget } = await buildItinerary(saved.placeIds, {
    hoursAvailable: saved.hoursAvailable,
    budgetUsd: saved.budgetUsd,
  });

  return (
    <main className="mx-auto max-w-3xl px-4 py-10 sm:py-16">
      <Link href="/" className="text-sm text-stone-600 hover:text-accent">
        ← Armar mi propio itinerario
      </Link>

      <h1 className="mt-4 font-display text-3xl text-ink">{saved.title}</h1>
      <p className="mt-1 text-sm text-stone-400">
        Compartido el {new Date(saved.createdAt).toLocaleDateString("es-PA", { day: "numeric", month: "long", year: "numeric" })}
      </p>

      <div className="mt-6 max-w-md">
        <ItineraryTimeline stops={stops} totalEstimatedUsd={totalEstimatedUsd} withinBudget={withinBudget} />
      </div>

      <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {stops.map((s) => (
          <PlaceCard key={s.place.id} place={s.place} />
        ))}
      </div>
    </main>
  );
}
