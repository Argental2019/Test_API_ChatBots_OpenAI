import './global.css';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Argental — Multi‑Agente',
  description: 'UI para operar agentes internos',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  );
}