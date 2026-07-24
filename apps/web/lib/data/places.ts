/**
 * Dataset semilla — stand-in de la tabla `places` de Supabase (ver
 * docs/panama-ai/03-base-de-datos.md) hasta que exista un proyecto Supabase real.
 * Curado a mano para Ciudad de Panamá / Casco Antiguo, alcance del MVP
 * (docs/panama-ai/09-mvp.md).
 */

export type Category =
  | "restaurant"
  | "rooftop"
  | "beach"
  | "hotel"
  | "tour"
  | "nightlife"
  | "museum"
  | "family";

export interface Place {
  id: string;
  slug: string;
  name: string;
  category: Category;
  zone: string;
  priceLevel: 1 | 2 | 3 | 4;
  description: string;
  tags: string[];
  hours: string;
  kidsFriendly: boolean;
  avgRating: number;
  contacts: {
    phone?: string;
    whatsapp?: string;
    instagram?: string;
    website?: string;
  };
  photo: string;
}

export const PLACES: Place[] = [
  {
    id: "p1",
    slug: "donde-jose",
    name: "Donde José",
    category: "restaurant",
    zone: "Casco Antiguo",
    priceLevel: 4,
    description:
      "Menú de degustación que reinterpreta ingredientes panameños de mercado. Reserva obligatoria, mesas limitadas por noche.",
    tags: ["fine dining", "romantico", "chef local"],
    hours: "Mar-Sáb 19:00-23:00",
    kidsFriendly: false,
    avgRating: 4.8,
    contacts: { whatsapp: "+507 6000 0001", instagram: "@dondejosepanama" },
    photo: "/placeholder/restaurant-1.jpg",
  },
  {
    id: "p2",
    slug: "mercado-de-mariscos",
    name: "Mercado de Mariscos",
    category: "restaurant",
    zone: "Casco Antiguo / Avenida Balboa",
    priceLevel: 1,
    description:
      "Ceviche recién hecho de pie frente al mar. La experiencia más panameña y económica para comer pescado del día.",
    tags: ["economico", "local", "ceviche"],
    hours: "Todos los días 08:00-17:00",
    kidsFriendly: true,
    avgRating: 4.5,
    contacts: { phone: "+507 212 0000" },
    photo: "/placeholder/restaurant-2.jpg",
  },
  {
    id: "p3",
    slug: "tantalo-rooftop",
    name: "Tántalo Rooftop",
    category: "rooftop",
    zone: "Casco Antiguo",
    priceLevel: 3,
    description:
      "Terraza sobre los techos de Casco Antiguo, DJ desde el atardecer, la vista clásica del skyline al fondo.",
    tags: ["vida nocturna", "vistas", "coctelería"],
    hours: "Todos los días 17:00-01:00",
    kidsFriendly: false,
    avgRating: 4.6,
    contacts: { instagram: "@tantalopanama", website: "https://tantalohotel.com" },
    photo: "/placeholder/rooftop-1.jpg",
  },
  {
    id: "p4",
    slug: "isla-taboga",
    name: "Isla Taboga",
    category: "beach",
    zone: "Golfo de Panamá (ferry desde la ciudad)",
    priceLevel: 2,
    description:
      "La playa más cercana a la ciudad accesible en ferry de 30 minutos. Ideal para medio día sin salir de la capital.",
    tags: ["playa", "escapada corta", "ferry"],
    hours: "Ferries desde 07:30, último regreso 17:00",
    kidsFriendly: true,
    avgRating: 4.3,
    contacts: { website: "https://tabogaexpress.com" },
    photo: "/placeholder/beach-1.jpg",
  },
  {
    id: "p5",
    slug: "biomuseo",
    name: "Biomuseo",
    category: "museum",
    zone: "Amador",
    priceLevel: 2,
    description:
      "Diseñado por Frank Gehry, cuenta la historia de cómo el istmo de Panamá cambió la biodiversidad del planeta.",
    tags: ["cultura", "familia", "arquitectura"],
    hours: "Mar-Dom 10:00-18:00",
    kidsFriendly: true,
    avgRating: 4.6,
    contacts: { website: "https://biomuseopanama.org" },
    photo: "/placeholder/museum-1.jpg",
  },
  {
    id: "p6",
    slug: "casco-viejo-free-walk",
    name: "Recorrido a pie por Casco Antiguo",
    category: "tour",
    zone: "Casco Antiguo",
    priceLevel: 1,
    description:
      "Ruta autoguiada por las plazas coloniales, murallas y fachadas restauradas del centro histórico declarado Patrimonio de la Humanidad.",
    tags: ["gratis", "historia", "caminata"],
    hours: "Cualquier hora, mejor luz 16:00-18:00",
    kidsFriendly: true,
    avgRating: 4.7,
    contacts: {},
    photo: "/placeholder/tour-1.jpg",
  },
  {
    id: "p7",
    slug: "canal-de-panama-miraflores",
    name: "Esclusas de Miraflores",
    category: "tour",
    zone: "Corredor Sur",
    priceLevel: 2,
    description:
      "Ver de cerca un buque cruzar el Canal de Panamá, con centro de visitantes y museo. La actividad emblemática del país.",
    tags: ["imperdible", "familia", "historia"],
    hours: "Todos los días 08:00-17:00",
    kidsFriendly: true,
    avgRating: 4.7,
    contacts: { website: "https://pancanal.com" },
    photo: "/placeholder/tour-2.jpg",
  },
  {
    id: "p8",
    slug: "selina-casco-viejo",
    name: "Selina Casco Viejo",
    category: "hotel",
    zone: "Casco Antiguo",
    priceLevel: 2,
    description:
      "Hostel/hotel boutique con rooftop propio, ideal para viajeros que quieren estar caminando dentro del casco histórico.",
    tags: ["boutique", "mochilero-friendly", "rooftop propio"],
    hours: "Check-in 15:00 / Check-out 12:00",
    kidsFriendly: false,
    avgRating: 4.2,
    contacts: { website: "https://selina.com", whatsapp: "+507 6000 0008" },
    photo: "/placeholder/hotel-1.jpg",
  },
  {
    id: "p9",
    slug: "casa-casco",
    name: "Casa Casco Hotel Boutique",
    category: "hotel",
    zone: "Casco Antiguo",
    priceLevel: 4,
    description:
      "Hotel boutique de lujo en un edificio colonial restaurado, a media cuadra de la Plaza de la Independencia.",
    tags: ["lujo", "boutique", "romantico"],
    hours: "Check-in 15:00 / Check-out 12:00",
    kidsFriendly: false,
    avgRating: 4.9,
    contacts: { website: "https://casacasco.com" },
    photo: "/placeholder/hotel-2.jpg",
  },
  {
    id: "p10",
    slug: "relic-bar",
    name: "Relic Bar",
    category: "nightlife",
    zone: "Casco Antiguo",
    priceLevel: 2,
    description:
      "Bar dentro de un antiguo hostel-convento, ambiente under y buena música en vivo los fines de semana.",
    tags: ["vida nocturna", "musica en vivo", "under"],
    hours: "Jue-Sáb 20:00-02:00",
    kidsFriendly: false,
    avgRating: 4.4,
    contacts: { instagram: "@relicbarpanama" },
    photo: "/placeholder/nightlife-1.jpg",
  },
  {
    id: "p11",
    slug: "parque-natural-metropolitano",
    name: "Parque Natural Metropolitano",
    category: "family",
    zone: "Ciudad de Panamá",
    priceLevel: 1,
    description:
      "Selva tropical real dentro de los límites de la ciudad, senderos cortos con posibilidad de ver perezosos y tucanes.",
    tags: ["naturaleza", "gratis", "familia", "senderismo"],
    hours: "Todos los días 06:00-17:00",
    kidsFriendly: true,
    avgRating: 4.5,
    contacts: { website: "https://parquemetropolitano.org" },
    photo: "/placeholder/family-1.jpg",
  },
  {
    id: "p12",
    slug: "mi-ranchito",
    name: "Mi Ranchito",
    category: "restaurant",
    zone: "Amador",
    priceLevel: 2,
    description:
      "Comida típica panameña frente al mar con vista al skyline y a los barcos esperando para cruzar el Canal.",
    tags: ["tipico", "vistas", "familia"],
    hours: "Todos los días 11:00-22:00",
    kidsFriendly: true,
    avgRating: 4.4,
    contacts: { phone: "+507 314 0000" },
    photo: "/placeholder/restaurant-3.jpg",
  },
];

export function findPlaceBySlug(slug: string): Place | undefined {
  return PLACES.find((p) => p.slug === slug);
}
