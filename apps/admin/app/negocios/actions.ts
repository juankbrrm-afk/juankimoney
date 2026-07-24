"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createPlace, deletePlace, slugify, updatePlace } from "@/lib/store";
import type { Category, Place, PlaceStatus } from "@/lib/types";

function parsePlaceForm(formData: FormData): Omit<Place, "id"> {
  const name = String(formData.get("name") ?? "").trim();
  if (!name) throw new Error("El nombre es obligatorio.");

  return {
    name,
    slug: slugify(name),
    category: String(formData.get("category") ?? "restaurant") as Category,
    zone: String(formData.get("zone") ?? "").trim(),
    priceLevel: Number(formData.get("priceLevel") ?? 2) as 1 | 2 | 3 | 4,
    description: String(formData.get("description") ?? "").trim(),
    tags: String(formData.get("tags") ?? "")
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean),
    hours: String(formData.get("hours") ?? "").trim(),
    kidsFriendly: formData.get("kidsFriendly") === "on",
    avgRating: Number(formData.get("avgRating") ?? 0),
    status: String(formData.get("status") ?? "draft") as PlaceStatus,
    contacts: {
      phone: String(formData.get("phone") ?? "").trim() || undefined,
      whatsapp: String(formData.get("whatsapp") ?? "").trim() || undefined,
      instagram: String(formData.get("instagram") ?? "").trim() || undefined,
      website: String(formData.get("website") ?? "").trim() || undefined,
    },
    photo: String(formData.get("photo") ?? "").trim() || "/placeholder/generic-1.jpg",
  };
}

export async function createPlaceAction(formData: FormData) {
  const input = parsePlaceForm(formData);
  await createPlace(input);
  revalidatePath("/negocios");
  redirect("/negocios");
}

export async function updatePlaceAction(id: string, formData: FormData) {
  const input = parsePlaceForm(formData);
  await updatePlace(id, input);
  revalidatePath("/negocios");
  redirect("/negocios");
}

export async function deletePlaceAction(id: string) {
  await deletePlace(id);
  revalidatePath("/negocios");
}
