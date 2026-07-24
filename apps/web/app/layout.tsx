import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Panama AI — tu concierge turístico con inteligencia artificial",
  description:
    "Describe tu viaje en tus propias palabras y recibe un itinerario real por Panamá, con lugares verificados.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  );
}
