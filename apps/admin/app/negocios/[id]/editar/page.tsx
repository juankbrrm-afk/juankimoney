import { notFound } from "next/navigation";
import { PlaceForm } from "@/components/PlaceForm";
import { getPlace } from "@/lib/store";
import { updatePlaceAction } from "@/app/negocios/actions";

export default async function EditarNegocioPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const place = await getPlace(id);
  if (!place) notFound();

  return (
    <div>
      <h1 className="mb-6 text-xl font-semibold text-ink">Editar {place.name}</h1>
      <PlaceForm place={place} action={updatePlaceAction.bind(null, id)} submitLabel="Guardar cambios" />
    </div>
  );
}
