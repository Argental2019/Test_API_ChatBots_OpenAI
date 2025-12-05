// apps/web/components/BusquettiBanner.tsx
"use client";

import Image from "next/image";

export default function BusquettiBanner() {
  return (
    <section className="w-full mb-12">
      {/* ================= DESKTOP ================= */}
      <div className="relative hidden md:block">
        <div className="mx-auto max-w-5xl relative">
          {/* Banner azul detrás, más chico */}
          <div className="relative h-56 lg:h-64 rounded-2xl shadow-lg overflow-hidden">
            <Image
              src="/busquetti/banner-busquetti-desktop.png"
              alt="Banner Busquetti"
              fill
              priority
              className="object-cover"
            />
          </div>

         {/* Persona sobresaliendo, alineada abajo con el banner */}
          <div className="pointer-events-none absolute bottom-0 right-16 flex items-end">
            <Image
              src="/busquetti/busquetti-persona.png"
              alt="Busquetti"
              width={620}
              height={680}
              priority
              className="
                w-40 lg:w-56   /* ajustá acá el tamaño */
                h-auto
                drop-shadow-2xl
                object-contain
              "
            />
          </div>

        </div>
      </div>

     {/* ================= MOBILE ================= */}
<div className="md:hidden mx-auto max-w-sm">
  {/* Persona como avatar debajo */}
  <div className="mt-6 flex items-center gap-4">
    <div className="relative h-20 w-20 shrink-0 rounded-full overflow-hidden border-2 border-blue-600 shadow">
      <Image
        src="/busquetti/busquetti-persona.png"
        alt="Busquetti"
        fill
        className="
          object-contain   /* no recorta la imagen */
          object-top       /* prioriza la parte de la cabeza */
        "
      />
    </div>

    <div className="flex flex-col">
      <span className="text-xs uppercase tracking-wide text-gray-500">
        Argental · IA
      </span>
      <span className="text-base font-semibold text-gray-900">
        Busquetti
      </span>
    </div>
  </div>
</div>

    </section>
  );
}
