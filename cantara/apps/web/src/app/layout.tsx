import type { Metadata, Viewport } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: {
    default: 'Cantara — Canciones con tu propia voz',
    template: '%s · Cantara',
  },
  description:
    'Entrena un modelo con tu voz y genera canciones completas cantadas por ti. Elige género, idioma y letra, o deja que la IA la escriba.',
  openGraph: {
    title: 'Cantara — Canciones con tu propia voz',
    description: 'Entrena tu voz una vez y canta en cualquier género.',
    type: 'website',
    locale: 'es_ES',
  },
  robots: { index: true, follow: true },
};

export const viewport: Viewport = {
  themeColor: '#0b0b12',
  width: 'device-width',
  initialScale: 1,
  // Sin `maximumScale`: limitar el zoom rompe la accesibilidad para quien
  // necesita ampliar, y no aporta nada al diseño.
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body className="min-h-dvh antialiased">
        {/* Salto al contenido: primera parada del tabulador, imprescindible
            cuando hay una barra de navegación con varios enlaces. */}
        <a
          href="#contenido"
          className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-accent-600 focus:px-4 focus:py-2 focus:text-white"
        >
          Saltar al contenido
        </a>
        {children}
      </body>
    </html>
  );
}
