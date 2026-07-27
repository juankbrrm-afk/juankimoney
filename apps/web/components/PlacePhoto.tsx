"use client";

import { useState } from "react";
import Image from "next/image";
import type { Category } from "@/lib/data/places";
import { CategoryIllustration } from "@/components/illustrations/CategoryIllustration";
import { CATEGORY_PHOTOS } from "@/lib/data/category-photos";

/**
 * Reemplaza `place.photo` real (Supabase Storage) cuando exista fotografía de negocios — ver
 * docs/panama-ai/09-mvp.md. Mientras tanto usa una foto real de Panamá por categoría (Wikimedia
 * Commons, ver category-photos.ts) y cae a la ilustración vectorial propia si la imagen no carga
 * (dominio caído, archivo renombrado/borrado) o si la categoría no tiene foto asignada — así
 * nunca se ve un ícono de "imagen rota".
 */
export function PlacePhoto({
  category,
  className = "",
}: {
  category?: Category;
  className?: string;
}) {
  const photo = category ? CATEGORY_PHOTOS[category] : undefined;
  const [failed, setFailed] = useState(false);

  if (!category) {
    return <div className={`bg-gradient-to-br from-stone-100 to-accent-soft/60 ${className}`} aria-hidden />;
  }

  if (!photo || failed) {
    return (
      <div className={`overflow-hidden ${className}`}>
        <CategoryIllustration category={category} className="h-full w-full" />
      </div>
    );
  }

  return (
    <div className={`relative overflow-hidden ${className}`}>
      <Image
        src={photo.url}
        alt=""
        fill
        sizes="(min-width: 1024px) 33vw, (min-width: 640px) 50vw, 100vw"
        className="object-cover"
        onError={() => setFailed(true)}
        unoptimized
      />
      <p className="absolute bottom-1 right-1.5 rounded bg-black/40 px-1.5 py-0.5 text-[9px] leading-tight text-white/80">
        {photo.credit}
      </p>
    </div>
  );
}
