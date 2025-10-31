// apps/web/app/layout.tsx
import type { ReactNode } from "react"; // asegura que el archivo sea un módulo y habilita el tipo

export const metadata = {
  title: "Multi-Agent Chat",
  description: "Argental Agents",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="es">
      <body className="min-h-screen bg-gray-50">{children}</body>
    </html>
  );
}
