import Link from "next/link";
import { listPlaces } from "@/lib/store";
import { CATEGORIES } from "@/lib/types";
import { deletePlaceAction } from "@/app/negocios/actions";

const CATEGORY_LABEL = Object.fromEntries(CATEGORIES.map((c) => [c.value, c.label]));
const STATUS_LABEL: Record<string, string> = { draft: "Borrador", published: "Publicado", archived: "Archivado" };

export default async function NegociosPage() {
  const places = await listPlaces();

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-ink">Negocios</h1>
          <p className="text-sm text-stone-600">{places.length} lugares en el catálogo</p>
        </div>
        <Link href="/negocios/nuevo" className="rounded-full bg-accent px-4 py-2 text-sm font-medium text-white">
          + Nuevo negocio
        </Link>
      </div>

      <div className="overflow-hidden rounded-2xl border border-stone-200 bg-white">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-stone-200 bg-stone-100 text-xs uppercase tracking-wide text-stone-600">
            <tr>
              <th className="px-4 py-3">Nombre</th>
              <th className="px-4 py-3">Categoría</th>
              <th className="px-4 py-3">Zona</th>
              <th className="px-4 py-3">Precio</th>
              <th className="px-4 py-3">Estado</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {places.map((place) => (
              <tr key={place.id} className="border-b border-stone-100 last:border-0">
                <td className="px-4 py-3 font-medium text-ink">{place.name}</td>
                <td className="px-4 py-3 text-stone-600">{CATEGORY_LABEL[place.category]}</td>
                <td className="px-4 py-3 text-stone-600">{place.zone}</td>
                <td className="px-4 py-3 text-stone-600">{"$".repeat(place.priceLevel)}</td>
                <td className="px-4 py-3">
                  <span className="rounded-full bg-accent-soft px-2.5 py-1 text-xs font-medium text-accent">
                    {STATUS_LABEL[place.status]}
                  </span>
                </td>
                <td className="px-4 py-3 text-right">
                  <div className="flex justify-end gap-3">
                    <Link href={`/negocios/${place.id}/editar`} className="text-xs font-medium text-accent">
                      Editar
                    </Link>
                    <form action={deletePlaceAction.bind(null, place.id)}>
                      <button type="submit" className="text-xs font-medium text-danger">
                        Eliminar
                      </button>
                    </form>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
