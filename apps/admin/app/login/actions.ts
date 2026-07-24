"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { ADMIN_COOKIE_NAME, createSessionToken } from "@/lib/auth";

export async function loginAction(formData: FormData) {
  const password = process.env.ADMIN_PASSWORD;
  const submitted = String(formData.get("password") ?? "");
  const next = String(formData.get("next") ?? "/negocios");

  if (!password || submitted !== password) {
    redirect(`/login?error=1&next=${encodeURIComponent(next)}`);
  }

  const token = await createSessionToken(password);
  const jar = await cookies();
  jar.set(ADMIN_COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 7,
  });

  redirect(next.startsWith("/") ? next : "/negocios");
}
