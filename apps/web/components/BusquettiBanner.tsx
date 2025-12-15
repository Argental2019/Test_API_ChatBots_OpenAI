// apps/web/components/BusquettiBanner.tsx
"use client";

import Image from "next/image";

export default function BusquettiBanner() {
  return (
    <section className="w-full mb-4">
      {/* ================= DESKTOP ================= */}
      <div className="relative hidden md:block">
        <div className="mx-auto max-w-5xl relative">
          {/* Banner con aspect ratio exacto de 2400x364 (6.59:1) */}
          <div className="relative w-full aspect-[2400/364] rounded-2xl shadow-lg overflow-hidden">
            <Image
              src="/busquetti/banner-busquetti-desktop.png"
              alt="Banner Busquetti"
              fill
              priority
              quality={100}
              sizes="(max-width: 1280px) 100vw, 1280px"
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
              quality={100}
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
  {/* Persona como avatar CENTRADA con texto debajo */}
  <div className="mt-0.01 flex flex-col items-center gap-1">
    <div className="relative h-28 w-28 shrink-0 rounded-full overflow-hidden border-2 border-blue-600 shadow">
      <Image
        src="/busquetti/busquetti-persona.png"
        alt="Busquetti"
        fill
        quality={100}
        className="
               object-cover   /* llena bien el círculo */
          object-top     /* prioriza la cabeza */

          scale-120       /* ajusta el zoom de la imagen */
        "
      />
    </div>

    <div className="flex flex-col items-center text-center">
      <span className="text-lg font-semibold text-gray-1000">
        Busquetti
      </span>
      <span className="text-lg uppercase tracking-wide text-gray-600">
        Argental · IA
      </span>
    </div>
  </div>
</div>


    </section>
  );
}