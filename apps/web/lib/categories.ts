import type { Category } from "@/lib/data/places";

export const CATEGORY_LABEL: Record<Category, string> = {
  restaurant: "Restaurante",
  rooftop: "Rooftop",
  beach: "Playa",
  hotel: "Hotel",
  tour: "Tour",
  nightlife: "Vida nocturna",
  museum: "Museo",
  family: "Familiar",
};

export const CATEGORIES: { value: Category; label: string }[] = (
  Object.entries(CATEGORY_LABEL) as [Category, string][]
).map(([value, label]) => ({ value, label }));
