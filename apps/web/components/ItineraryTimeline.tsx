import type { ItineraryStop } from "@/lib/ai/tools";

export function ItineraryTimeline({
  stops,
  totalEstimatedUsd,
  withinBudget,
}: {
  stops: ItineraryStop[];
  totalEstimatedUsd?: number;
  withinBudget?: boolean;
}) {
  if (!stops.length) return null;

  return (
    <div className="rounded-2xl border border-stone-200 bg-white p-4">
      <div className="mb-3 flex items-center justify-between">
        <h4 className="font-display text-base text-ink">Tu itinerario</h4>
        {typeof totalEstimatedUsd === "number" && (
          <span
            className={`text-xs font-medium ${withinBudget === false ? "text-red-600" : "text-stone-600"}`}
          >
            ~${totalEstimatedUsd} estimado
          </span>
        )}
      </div>
      <ol className="space-y-3">
        {stops.map((stop) => (
          <li key={stop.place.id} className="flex items-start gap-3">
            <span className="mt-0.5 flex h-6 w-6 flex-none items-center justify-center rounded-full bg-accent-soft text-xs font-semibold text-accent-strong">
              {stop.order}
            </span>
            <div>
              <p className="text-sm font-medium text-ink">{stop.place.name}</p>
              <p className="text-xs text-stone-600">{stop.place.zone} · {stop.place.hours}</p>
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}
