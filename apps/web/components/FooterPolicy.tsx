"use client";

import Link from "next/link";

export default function FooterPolicy() {
  return (
    <footer className="mx-auto max-w-6xl px-4 py-8 text-center text-xs text-gray-500 leading-relaxed">
      <p>© {new Date().getFullYear()} Argental · Asistentes</p>

      <p className="mt-2">
        El uso de los Agentes Argental implica la aceptación de la siguiente{" "}
        <Link
          href="/politicas-de-uso-Argental"
          target="_blank"
          rel="noopener noreferrer"
          className="text-blue-600 hover:underline"
        >
          Política de Uso y Limitación de Responsabilidad de los Agentes Argental
        </Link>.
      </p>
    </footer>
  );
}
