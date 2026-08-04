import type { NextConfig } from 'next';

const config: NextConfig = {
  reactStrictMode: true,

  // Los paquetes del monorepo se publican como TypeScript sin compilar, así
  // que Next debe transpilarlos igual que al código de la app. Es lo que
  // permite compartir los esquemas Zod entre navegador, API y worker sin un
  // paso de build intermedio.
  transpilePackages: ['@cantara/shared'],

  // Rutas tipadas: un enlace a una ruta inexistente rompe la compilación
  // en vez de dar un 404 en producción.
  typedRoutes: true,

  // El monorepo vive dentro de otro repositorio con su propio lockfile; sin
  // esto Next infiere mal la raíz y traza archivos que no le corresponden.
  outputFileTracingRoot: import.meta.dirname + '/../..',

  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'X-Frame-Options', value: 'DENY' },
          // El micrófono se usa en el estudio de voz; el resto se deniega.
          { key: 'Permissions-Policy', value: 'camera=(), geolocation=(), microphone=(self)' },
        ],
      },
    ];
  },
};

export default config;
