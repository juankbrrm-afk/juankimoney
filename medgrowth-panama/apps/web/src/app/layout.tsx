import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "MedGrowth Panama",
  description: "Llenamos la agenda de tu clínica con pacientes calificados.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  );
}
