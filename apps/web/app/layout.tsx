//apps\web\app\layout.tsx
import "./global.css";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Argental — Agentes IA",
  description: "Asesores IA de productos",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <head>
        <link rel="preload" href="/busquetti/BusquettiEsperandoV5.mp4" as="video" type="video/mp4" />
        <link rel="preload" href="/busquetti/BusquettiHablandoV5.mp4" as="video" type="video/mp4" />
      </head>
      <body>{children}</body>
    </html>
  );
}