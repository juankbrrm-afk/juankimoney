import type { Category } from "@/lib/data/places";
import { CategoryIllustration } from "@/components/illustrations/CategoryIllustration";

/**
 * Reemplaza `place.photo` real (Supabase Storage) cuando exista fotografía de negocios —
 * ver docs/panama-ai/09-mvp.md y la nota en el README sobre por qué esto es una
 * ilustración propia y no una foto: este entorno de desarrollo no tiene salida a internet
 * hacia bancos de imágenes. Mientras tanto, cada categoría tiene su propia escena
 * ilustrada de un lugar/paisaje real de Panamá (ver CategoryIllustration.tsx) en vez de un
 * ícono genérico de "imagen rota".
 */
export function PlacePhoto({
  category,
  className = "",
}: {
  category?: Category;
  className?: string;
}) {
  if (!category) {
    return <div className={`bg-gradient-to-br from-stone-100 to-accent-soft/60 ${className}`} aria-hidden />;
  }

  return (
    <div className={`overflow-hidden ${className}`}>
      <CategoryIllustration category={category} className="h-full w-full" />
    </div>
  );
}
