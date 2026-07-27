import type { Category } from "@/lib/data/places";

/**
 * Fotografía real de Panamá vía Wikimedia Commons (Special:FilePath resuelve al archivo
 * original sin necesitar el hash de carpeta), una por categoría — no por lugar individual,
 * mismo criterio que las ilustraciones que reemplaza: una escena representativa de la
 * categoría, no la fachada exacta del negocio. Sin foto confiable y específica de Panamá para
 * "restaurant" (solo resultados genéricos o de otros países), esa categoría se queda con la
 * ilustración de CategoryIllustration.tsx en vez de arriesgar una imagen mal etiquetada.
 *
 * Todas son CC BY / CC BY-SA — créditor visible en PlacePhoto. Antes de un lanzamiento público
 * real, confirmar el nombre exacto del autor en cada file page (aquí se linkea la file page,
 * no solo el nombre de archivo).
 */
export const CATEGORY_PHOTOS: Partial<
  Record<Category, { url: string; filePage: string; credit: string }>
> = {
  beach: {
    url: "https://commons.wikimedia.org/wiki/Special:FilePath/TabogaBeach.JPG?width=1600",
    filePage: "https://commons.wikimedia.org/wiki/File:TabogaBeach.JPG",
    credit: "Isla Taboga — Wikimedia Commons, CC BY 3.0",
  },
  museum: {
    url: "https://commons.wikimedia.org/wiki/Special:FilePath/Biomuseo_panama.jpg?width=1600",
    filePage: "https://commons.wikimedia.org/wiki/File:Biomuseo_panama.jpg",
    credit: "Biomuseo — Wikimedia Commons",
  },
  tour: {
    url: "https://commons.wikimedia.org/wiki/Special:FilePath/Panama_Canal_Miraflores_Locks.jpg?width=1600",
    filePage: "https://commons.wikimedia.org/wiki/File:Panama_Canal_Miraflores_Locks.jpg",
    credit: "Esclusas de Miraflores — Wikimedia Commons",
  },
  rooftop: {
    url: "https://commons.wikimedia.org/wiki/Special:FilePath/Panama_City_Skyline_2015.jpg?width=1600",
    filePage: "https://commons.wikimedia.org/wiki/File:Panama_City_Skyline_2015.jpg",
    credit: "Skyline de Ciudad de Panamá — Wikimedia Commons, CC BY-SA 4.0",
  },
  nightlife: {
    url: "https://commons.wikimedia.org/wiki/Special:FilePath/Panama_City_night_view.jpg?width=1600",
    filePage: "https://commons.wikimedia.org/wiki/File:Panama_City_night_view.jpg",
    credit: "Ciudad de Panamá de noche — Wikimedia Commons",
  },
  family: {
    url: "https://commons.wikimedia.org/wiki/Special:FilePath/Brown-throated_sloth_(Bradypus_variegatus)_female.jpg?width=1600",
    filePage:
      "https://commons.wikimedia.org/wiki/File:Brown-throated_sloth_(Bradypus_variegatus)_female.jpg",
    credit: "Perezoso de garganta café, Panamá — Wikimedia Commons, CC BY-SA 4.0",
  },
  hotel: {
    url: "https://commons.wikimedia.org/wiki/Special:FilePath/Colonial_Facade_with_Birds_-_Casco_Viejo_(Old_City)_-_Panama_City_-_Panama_(11427373134).jpg?width=1600",
    filePage:
      "https://commons.wikimedia.org/wiki/File:Colonial_Facade_with_Birds_-_Casco_Viejo_(Old_City)_-_Panama_City_-_Panama_(11427373134).jpg",
    credit: "Casco Viejo — Wikimedia Commons",
  },
};

export const HERO_PHOTO = CATEGORY_PHOTOS.nightlife!;
