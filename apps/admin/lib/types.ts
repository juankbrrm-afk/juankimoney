export type Category =
  | "restaurant"
  | "rooftop"
  | "beach"
  | "hotel"
  | "tour"
  | "nightlife"
  | "museum"
  | "family";

export const CATEGORIES: { value: Category; label: string }[] = [
  { value: "restaurant", label: "Restaurante" },
  { value: "rooftop", label: "Rooftop" },
  { value: "beach", label: "Playa" },
  { value: "hotel", label: "Hotel" },
  { value: "tour", label: "Tour" },
  { value: "nightlife", label: "Vida nocturna" },
  { value: "museum", label: "Museo" },
  { value: "family", label: "Familiar" },
];

export type PlaceStatus = "draft" | "published" | "archived";

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
  status: PlaceStatus;
  contacts: {
    phone?: string;
    whatsapp?: string;
    instagram?: string;
    website?: string;
  };
  photo: string;
}
