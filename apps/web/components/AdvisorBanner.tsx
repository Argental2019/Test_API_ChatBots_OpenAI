// apps/web/components/AdvisorBanner.tsx
"use client";

import Link from "next/link";

export default function AdvisorBanner() {
  return (
    <div
      className="mt-6 mb-8 flex items-center justify-between gap-4 rounded-2xl bg-white px-8 py-6"
      style={{ border: "2px solid #1B2A5E" }}
    >
      {/* Izquierda: avatar + texto */}
      <div className="flex items-center gap-6">
        <div
          className="shrink-0 rounded-full overflow-hidden"
          style={{ width: 96, height: 96, border: "2px solid #e5e7eb" }}
        >
          <img
            src="/busquetti/busquetti-persona.png"
            alt="Busquetti Asesor"
            style={{
              width: "100%",
              height: "100%",
              objectFit: "cover",
              objectPosition: "center 8%",
            }}
          />
        </div>

        <div>
          <div
            className="mb-2 inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-sm"
            style={{ background: "#EEF2FF", color: "#1B2A5E" }}
          >
            <span className="relative flex size-2">
              <span className="absolute inline-flex size-full animate-ping rounded-full bg-emerald-400 opacity-75" />
              <span className="relative inline-flex size-2 rounded-full bg-emerald-400" />
            </span>
            Asesor IA en línea
          </div>

          <h2 className="text-3xl font-bold leading-tight">
            <span style={{ color: "#1B2A5E" }}>Busquetti</span>
            <span className="text-gray-700"> — Asesor Integral</span>
          </h2>
          <p className="mt-1.5 text-base text-gray-500 max-w-lg">
            Contanos qué querés producir y te recomendamos los equipos ideales para tu negocio.
          </p>
        </div>
      </div>

      {/* Botón */}
      <Link
        href="/advisor"
        className="shrink-0 inline-flex items-center gap-2 rounded-xl px-6 py-4 text-base font-bold transition-all hover:scale-105 active:scale-95"
        style={{ background: "#F5A800", color: "#1B2A5E" }}
      >
        Consultar al Asesor →
      </Link>
    </div>
  );
}