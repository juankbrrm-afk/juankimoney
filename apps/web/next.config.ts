import type { NextConfig } from "next";
import path from "node:path";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Monorepo: lib/data/places.ts y lib/itineraries/store.ts leen /data/* fuera de
  // apps/web (ver /data/README.md). El tracer de Next no detecta esas rutas
  // automáticamente porque se arman en runtime con path.join(process.cwd(), ...), no
  // como string literal — sin esto, el build serverless (Vercel u otro) no empaqueta
  // el JSON y la app se rompe en producción con ENOENT. outputFileTracingRoot apunta a
  // la raíz del monorepo (patrón recomendado por Vercel para apps que dependen de
  // archivos fuera de su carpeta).
  outputFileTracingRoot: path.join(import.meta.dirname, "..", ".."),
  outputFileTracingIncludes: {
    "/**": ["../../data/**"],
  },
  images: {
    remotePatterns: [{ protocol: "https", hostname: "**" }],
  },
};

export default nextConfig;
