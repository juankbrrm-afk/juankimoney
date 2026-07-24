import type { Metadata } from "next";
import Link from "next/link";
import { cookies } from "next/headers";
import { ADMIN_COOKIE_NAME, verifySessionToken } from "@/lib/auth";
import { logoutAction } from "@/app/logout-action";
import "./globals.css";

export const metadata: Metadata = {
  title: "Panama AI — Admin",
  description: "Panel interno para gestionar negocios, categorías y contenido de Panama AI.",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const jar = await cookies();
  const password = process.env.ADMIN_PASSWORD;
  const hasSession = password ? await verifySessionToken(jar.get(ADMIN_COOKIE_NAME)?.value, password) : false;

  return (
    <html lang="es">
      <body>
        {hasSession ? (
          <div className="flex min-h-screen">
            <aside className="flex w-56 flex-none flex-col border-r border-stone-200 bg-white p-5">
              <p className="mb-8 text-sm font-semibold tracking-tight text-ink">Panama AI · Admin</p>
              <nav className="flex flex-col gap-1 text-sm">
                <Link href="/negocios" className="rounded-lg px-3 py-2 text-ink hover:bg-stone-100">
                  Negocios
                </Link>
                <Link href="/categorias" className="rounded-lg px-3 py-2 text-ink hover:bg-stone-100">
                  Categorías
                </Link>
              </nav>
              <form action={logoutAction} className="mt-auto">
                <button type="submit" className="w-full rounded-lg px-3 py-2 text-left text-sm text-stone-600 hover:bg-stone-100">
                  Cerrar sesión
                </button>
              </form>
            </aside>
            <main className="flex-1 p-8">{children}</main>
          </div>
        ) : (
          children
        )}
      </body>
    </html>
  );
}
