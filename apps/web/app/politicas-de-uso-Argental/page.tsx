"use client";

import Link from "next/link";

export default function PoliticasDeUsoPage() {
  const updated = "noviembre de 2025";

  return (
    <main className="mx-auto max-w-4xl px-4 pb-20 pt-8">
      {/* Header */}
      <header className="mb-6 flex items-start justify-between gap-4">
        <Link
          href="/"
          className="inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
        >
          ← Volver
        </Link>

        <div className="text-right">
          <p className="text-[11px] uppercase tracking-wide text-gray-500">Documento oficial</p>
          <p className="text-xs text-gray-500">Última actualización: {updated}</p>
        </div>
      </header>

      {/* Título */}
      <h1 className="text-balance text-2xl font-bold leading-tight text-gray-900 md:text-3xl">
        🧾 Política de Uso y Limitación de Responsabilidad de los Agentes Argental
      </h1>

      <p className="mt-2 text-sm text-gray-600">
        Titular: <span className="font-medium">Argental S.A.I.C.</span>
      </p>

      {/* Contenido + Índice */}
      <div className="mt-8 grid gap-8 md:grid-cols-[1fr_260px]">
        {/* Contenido */}
        <article className="prose prose-gray max-w-none prose-p:my-3 prose-headings:scroll-mt-24">
          <section id="objeto">
            <h2 className="text-xl font-semibold">1. Objeto</h2>
            <p>
              Los agentes inteligentes desarrollados por Argental S.A.I.C. (en adelante, “los Agentes Argental”) tienen
              como finalidad asistir a usuarios internos y externos en la consulta, interpretación y aplicación de
              información técnica sobre los equipos y productos fabricados por la empresa.
            </p>
            <p>
              Estos agentes utilizan tecnología de inteligencia artificial (IA) conectada a bases documentales
              almacenadas en entornos de nube seguros, garantizando el acceso a información verificada y actualizada.
            </p>
            <p>
              El sistema se apoya en una infraestructura de software propia que procesa y presenta la información de
              forma automatizada, preservando la integridad y confidencialidad de los datos.
            </p>
          </section>

          <hr />

          <section id="alcance">
            <h2 className="text-xl font-semibold">2. Alcance y limitaciones</h2>
            <ul className="list-disc pl-5 space-y-1 marker:text-gray-500">
              <li>
                Los Agentes Argental no reemplazan la asistencia técnica humana, ni las consultas con el equipo de
                ingeniería o servicio técnico de Argental S.A.I.C.
              </li>
              <li>
                Las respuestas generadas se basan exclusivamente en información documentada, validada y alojada en los
                sistemas de la empresa, sin recurrir a fuentes externas.
              </li>
              <li>Los agentes no utilizan Internet ni bases de datos públicas para generar sus respuestas.</li>
              <li>
                Si la información requerida no está disponible, el agente puede informar que no cuenta con datos
                suficientes.
              </li>
              <li>
                Las respuestas son orientativas e informativas y deben verificarse antes de su aplicación práctica,
                especialmente en contextos operativos, de mantenimiento o reparación.
              </li>
            </ul>
          </section>

          <hr />

          <section id="usuario">
            <h2 className="text-xl font-semibold">3. Responsabilidad del usuario</h2>
            <ul className="list-disc pl-5 space-y-1 marker:text-gray-500">
              <li>
                El usuario es responsable de verificar la exactitud y vigencia de la información antes de tomar
                decisiones o realizar acciones técnicas.
              </li>
              <li>
                Argental S.A.I.C. no se hace responsable por daños, pérdidas o perjuicios derivados del mal uso directo
                o indirecto de las respuestas emitidas por los agentes.
              </li>
              <li>
                Toda acción técnica, comercial o de mantenimiento debe realizarse bajo supervisión de personal
                calificado.
              </li>
            </ul>
          </section>

          <hr />

          <section id="exencion">
            <h2 className="text-xl font-semibold">4. Exención de responsabilidad</h2>
            <ul className="list-disc pl-5 space-y-1 marker:text-gray-500">
              <li>
                Por la propia naturaleza de la herramienta de inteligencia artificial, Argental S.A.I.C. no garantiza
                que la información esté libre de errores, omisiones o desactualizaciones.
              </li>
              <li>
                No será responsable por daños directos, indirectos, incidentales o consecuentes derivados del mal uso de
                las respuestas.
              </li>
              <li>
                No garantiza la disponibilidad continua o el funcionamiento ininterrumpido del servicio, que depende de
                plataformas y servicios de terceros.
              </li>
              <li>
                No asume responsabilidad por interpretaciones erróneas, uso indebido o aplicación incorrecta de la
                información suministrada.
              </li>
            </ul>
          </section>

          <hr />

          <section id="privacidad">
            <h2 className="text-xl font-semibold">5. Privacidad y seguridad</h2>
            <ul className="list-disc pl-5 space-y-1 marker:text-gray-500">
              <li>Los Agentes Argental no almacenan ni recopilan información personal de los usuarios.</li>
              <li>
                Los datos técnicos y documentales se alojan en entornos de nube con estándares internacionales de
                seguridad y confidencialidad.
              </li>
              <li>
                Argental S.A.I.C. implementa protocolos de protección, autenticación y control de acceso para
                garantizar la integridad y trazabilidad de la información.
              </li>
            </ul>
          </section>

          <hr />

          <section id="modificaciones">
            <h2 className="text-xl font-semibold">6. Modificaciones</h2>
            <p>
              Argental S.A.I.C. se reserva el derecho de modificar, actualizar o complementar esta Política en cualquier
              momento, sin previo aviso. Las versiones actualizadas se publicarán en los mismos entornos donde se ofrece
              acceso a los agentes.
            </p>
          </section>

          <hr />

          <section id="aceptacion">
            <h2 className="text-xl font-semibold">7. Aceptación</h2>
            <p>
              El uso de cualquiera de los Agentes Argental implica la aceptación total y sin reservas de esta Política
              de Uso y de las condiciones aquí establecidas.
            </p>
          </section>
        </article>

        {/* Índice lateral */}
        <aside className="md:sticky md:top-20">
          <div className="rounded-xl border bg-white p-4 shadow-sm">
            <h3 className="mb-2 text-sm font-semibold text-gray-800">Contenido</h3>
            <nav className="text-sm leading-6 text-gray-700">
              <ul className="space-y-1">
                <li><a className="hover:underline" href="#objeto">1. Objeto</a></li>
                <li><a className="hover:underline" href="#alcance">2. Alcance y limitaciones</a></li>
                <li><a className="hover:underline" href="#usuario">3. Responsabilidad del usuario</a></li>
                <li><a className="hover:underline" href="#exencion">4. Exención de responsabilidad</a></li>
                <li><a className="hover:underline" href="#privacidad">5. Privacidad y seguridad</a></li>
                <li><a className="hover:underline" href="#modificaciones">6. Modificaciones</a></li>
                <li><a className="hover:underline" href="#aceptacion">7. Aceptación</a></li>
              </ul>
            </nav>

            <hr className="my-4" />

            <Link
              href="/"
              className="inline-flex w-full items-center justify-center rounded-lg border px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              Ir al inicio
            </Link>
          </div>
        </aside>
      </div>
    </main>
  );
}
