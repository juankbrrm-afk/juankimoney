import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: "Panama AI — Admin",
  description: "Panel interno para gestionar negocios, categorías y contenido de Panama AI.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body>
        <div className="flex min-h-screen">
          <aside className="w-56 flex-none border-r border-stone-200 bg-white p-5">
            <p className="mb-8 text-sm font-semibold tracking-tight text-ink">Panama AI · Admin</p>
            <nav className="flex flex-col gap-1 text-sm">
              <Link href="/negocios" className="rounded-lg px-3 py-2 text-ink hover:bg-stone-100">
                Negocios
              </Link>
              <Link href="/categorias" className="rounded-lg px-3 py-2 text-ink hover:bg-stone-100">
                Categorías
              </Link>
            </nav>
          </aside>
          <main className="flex-1 p-8">{children}</main>
        </div>
      </body>
    </html>
  );
}
