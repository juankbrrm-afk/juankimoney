'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useState } from 'react';
import clsx from 'clsx';
import { api } from '@/lib/api';
import { Button } from './ui';

const LINKS = [
  { href: '/app', label: 'Panel' },
  { href: '/app/create', label: 'Crear' },
  { href: '/app/voices', label: 'Mis voces' },
  { href: '/app/songs', label: 'Canciones' },
  { href: '/app/credits', label: 'Créditos' },
] as const;

/**
 * Navegación principal.
 *
 * En escritorio es una fila de enlaces; en móvil se convierte en una barra
 * inferior fija, que es donde el pulgar llega sin recolocar la mano. Un menú
 * hamburguesa escondería justo las cinco acciones que el usuario repite.
 */
export function AppNav({ credits, displayName }: { credits: number; displayName: string }) {
  const pathname = usePathname();
  const router = useRouter();
  const [loggingOut, setLoggingOut] = useState(false);

  const isActive = (href: string) =>
    href === '/app' ? pathname === '/app' : pathname.startsWith(href);

  async function logout() {
    setLoggingOut(true);
    await api.logout().catch(() => {});
    router.push('/');
    router.refresh();
  }

  return (
    <>
      <nav className="hidden flex-1 items-center gap-1 sm:flex" aria-label="Principal">
        {LINKS.map((link) => (
          <Link
            key={link.href}
            href={link.href}
            aria-current={isActive(link.href) ? 'page' : undefined}
            className={clsx(
              'rounded-[--radius-control] px-3 py-2 text-sm font-medium transition-colors',
              isActive(link.href)
                ? 'bg-ink-850 text-ink-100'
                : 'text-ink-400 hover:bg-ink-900 hover:text-ink-100',
            )}
          >
            {link.label}
          </Link>
        ))}
      </nav>

      <div className="ml-auto flex items-center gap-3">
        <Link
          href="/app/credits"
          className="flex items-center gap-1.5 rounded-full border border-accent-600/30 bg-accent-600/10 px-3 py-1.5 text-sm font-medium text-accent-300 transition-colors hover:bg-accent-600/20"
        >
          <span aria-hidden>◈</span>
          <span className="tabular-nums">{credits}</span>
          <span className="sr-only">créditos disponibles</span>
        </Link>

        <div className="hidden items-center gap-2 sm:flex">
          <span className="max-w-32 truncate text-sm text-ink-400" title={displayName}>
            {displayName}
          </span>
          <Button variant="ghost" size="sm" onClick={logout} loading={loggingOut}>
            Salir
          </Button>
        </div>
      </div>

      {/* Barra inferior en móvil. `pb-[env(safe-area-inset-bottom)]` evita que
          los iconos queden bajo el indicador de inicio del iPhone. */}
      <nav
        className="fixed inset-x-0 bottom-0 z-40 flex border-t border-ink-900 bg-ink-950/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-lg sm:hidden"
        aria-label="Principal (móvil)"
      >
        {LINKS.map((link) => (
          <Link
            key={link.href}
            href={link.href}
            aria-current={isActive(link.href) ? 'page' : undefined}
            className={clsx(
              'flex flex-1 flex-col items-center gap-1 py-3 text-[11px] font-medium transition-colors',
              isActive(link.href) ? 'text-accent-300' : 'text-ink-600',
            )}
          >
            <span aria-hidden className="text-base">
              {ICONS[link.href]}
            </span>
            {link.label}
          </Link>
        ))}
      </nav>
    </>
  );
}

const ICONS: Record<string, string> = {
  '/app': '◎',
  '/app/create': '✦',
  '/app/voices': '◍',
  '/app/songs': '♪',
  '/app/credits': '◈',
};
