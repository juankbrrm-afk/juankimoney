import { PlaceForm } from "@/components/PlaceForm";
import { createPlaceAction } from "@/app/negocios/actions";

export default function NuevoNegocioPage() {
  return (
    <div>
      <h1 className="mb-6 text-xl font-semibold text-ink">Nuevo negocio</h1>
      <PlaceForm action={createPlaceAction} submitLabel="Crear negocio" />
    </div>
  );
}
