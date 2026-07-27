import type { Metadata, Viewport } from "next";
import { Inter, Fraunces } from "next/font/google";
import { ServiceWorkerRegister } from "@/components/ServiceWorkerRegister";
import { SiteHeader } from "@/components/SiteHeader";
import "./globals.css";

// Inter para UI (misma elección que Linear, una de las referencias del brief — no es un
// default perezoso). Fraunces para titulares: serif cálida con carácter editorial, la
// intención original de docs/panama-ai/05-componentes-ui.md que nunca se había cargado de
// verdad (antes caía en el fallback Georgia del sistema). next/font/google la descarga en
// build time y la sirve desde el propio dominio — cero requests externas en producción.
const inter = Inter({ subsets: ["latin"], variable: "--font-inter", display: "swap" });
const fraunces = Fraunces({ subsets: ["latin"], variable: "--font-fraunces", display: "swap" });

export const metadata: Metadata = {
  title: "Panama AI — tu concierge turístico con inteligencia artificial",
  description:
    "Describe tu viaje en tus propias palabras y recibe un itinerario real por Panamá, con lugares verificados.",
  manifest: "/manifest.json",
  icons: {
    icon: [
      { url: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: "/icon-192.png",
  },
};

export const viewport: Viewport = {
  themeColor: "#0f6e63",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es" className={`${inter.variable} ${fraunces.variable}`}>
      <body>
        <SiteHeader />
        {children}
        <ServiceWorkerRegister />
      </body>
    </html>
  );
}
