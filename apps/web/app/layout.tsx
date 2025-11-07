import "./global.css";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Argental — Agentes IA",
  description: "Asesores IA de productos",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  );
}
