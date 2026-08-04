import Link from 'next/link';
import { requireUser } from '@/lib/server';
import { AppNav } from '@/components/AppNav';

/**
 * Layout del área autenticada.
 *
 * La comprobación de sesión vive aquí y no en cada página: un layout de
 * Next envuelve a todas sus rutas hijas, así que ninguna puede olvidarse de
 * pedir autenticación por descuido.
 */
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser('/app');

  return (
    <div className="min-h-dvh">
      <header className="sticky top-0 z-40 border-b border-ink-900 bg-ink-950/85 backdrop-blur-lg">
        <div className="mx-auto flex h-16 max-w-6xl items-center gap-6 px-5">
          <Link href="/app" className="shrink-0 text-lg font-semibold tracking-tight">
            <span className="text-gradient">Cantara</span>
          </Link>

          <AppNav credits={user.credits} displayName={user.displayName} />
        </div>
      </header>

      <main id="contenido" className="mx-auto max-w-6xl px-5 py-8 pb-24 sm:py-10">
        {children}
      </main>
    </div>
  );
}
