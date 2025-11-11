export default function PoliticasDeUsoPage() {
  const updated = "noviembre de 2025";

  return (
    <main className="min-h-screen bg-gradient-to-br from-slate-50 via-gray-50 to-slate-100">
      {/* Header fijo con efecto glassmorphism */}
      <header className="sticky top-0 z-50 border-b border-gray-200 bg-white/80 backdrop-blur-md">
        <div className="mx-auto max-w-6xl px-6 py-4">
          <div className="flex items-center justify-between">
            <a
              href="/"
              className="inline-flex items-center gap-2 rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 shadow-sm transition-all hover:bg-gray-50 hover:shadow"
            >
              <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
              </svg>
              Volver
            </a>

            <div className="text-right">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-500">
                Documento Legal
              </p>
              <p className="text-xs font-medium text-gray-600">
                Actualizado: {updated}
              </p>
            </div>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-6xl px-6 py-12">
        {/* Encabezado del documento */}
        <div className="mb-12 rounded-2xl border border-gray-200 bg-white p-8 shadow-lg">
          <div className="mb-6 flex items-start gap-4">
            <div className="flex h-16 w-16 items-center justify-center rounded-xl bg-gradient-to-br from-blue-600 to-blue-700 text-3xl shadow-md">
              🧾
            </div>
            <div className="flex-1">
              <h1 className="mb-2 text-3xl font-bold leading-tight text-gray-900">
                Política de Uso y Limitación de Responsabilidad
              </h1>
              <p className="text-lg text-gray-600">Agentes Inteligentes Argental</p>
            </div>
          </div>
          
          <div className="rounded-lg border border-blue-100 bg-blue-50 p-4">
            <p className="text-sm font-medium text-gray-700">
              <span className="font-semibold text-blue-900">Titular:</span>{" "}
              <span className="text-gray-900">Argental S.A.I.C.</span>
            </p>
          </div>
        </div>

        {/* Contenido principal con sidebar */}
        <div className="grid gap-8 lg:grid-cols-[1fr_280px]">
          {/* Artículo principal */}
          <article className="space-y-8">
            {/* Sección 1 */}
            <section id="objeto" className="rounded-xl border border-gray-200 bg-white p-8 shadow-sm transition-shadow hover:shadow-md">
              <div className="mb-4 flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-100 text-lg font-bold text-blue-700">
                  1
                </div>
                <h2 className="text-2xl font-bold text-gray-900">Objeto</h2>
              </div>
              
              <div className="space-y-4 text-gray-700 leading-relaxed">
                <p>
                  Los agentes inteligentes desarrollados por Argental S.A.I.C. (en adelante, "los Agentes Argental") tienen
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
              </div>
            </section>

            {/* Sección 2 */}
            <section id="alcance" className="rounded-xl border border-gray-200 bg-white p-8 shadow-sm transition-shadow hover:shadow-md">
              <div className="mb-4 flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-100 text-lg font-bold text-blue-700">
                  2
                </div>
                <h2 className="text-2xl font-bold text-gray-900">Alcance y Limitaciones</h2>
              </div>
              
              <ul className="space-y-3 text-gray-700 leading-relaxed">
                <li className="flex gap-3">
                  <span className="mt-1.5 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-blue-600"></span>
                  <span>
                    Los Agentes Argental no reemplazan la asistencia técnica humana, ni las consultas con el equipo de
                    ingeniería o servicio técnico de Argental S.A.I.C.
                  </span>
                </li>
                <li className="flex gap-3">
                  <span className="mt-1.5 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-blue-600"></span>
                  <span>
                    Las respuestas generadas se basan exclusivamente en información documentada, validada y alojada en los
                    sistemas de la empresa, sin recurrir a fuentes externas.
                  </span>
                </li>
                <li className="flex gap-3">
                  <span className="mt-1.5 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-blue-600"></span>
                  <span>Los agentes no utilizan Internet ni bases de datos públicas para generar sus respuestas.</span>
                </li>
                <li className="flex gap-3">
                  <span className="mt-1.5 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-blue-600"></span>
                  <span>
                    Si la información requerida no está disponible, el agente puede informar que no cuenta con datos
                    suficientes.
                  </span>
                </li>
                <li className="flex gap-3">
                  <span className="mt-1.5 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-blue-600"></span>
                  <span>
                    Las respuestas son orientativas e informativas y deben verificarse antes de su aplicación práctica,
                    especialmente en contextos operativos, de mantenimiento o reparación.
                  </span>
                </li>
              </ul>
            </section>

            {/* Sección 3 */}
            <section id="usuario" className="rounded-xl border border-gray-200 bg-white p-8 shadow-sm transition-shadow hover:shadow-md">
              <div className="mb-4 flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-100 text-lg font-bold text-blue-700">
                  3
                </div>
                <h2 className="text-2xl font-bold text-gray-900">Responsabilidad del Usuario</h2>
              </div>
              
              <ul className="space-y-3 text-gray-700 leading-relaxed">
                <li className="flex gap-3">
                  <span className="mt-1.5 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-blue-600"></span>
                  <span>
                    El usuario es responsable de verificar la exactitud y vigencia de la información antes de tomar
                    decisiones o realizar acciones técnicas.
                  </span>
                </li>
                <li className="flex gap-3">
                  <span className="mt-1.5 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-blue-600"></span>
                  <span>
                    Argental S.A.I.C. no se hace responsable por daños, pérdidas o perjuicios derivados del mal uso directo
                    o indirecto de las respuestas emitidas por los agentes.
                  </span>
                </li>
                <li className="flex gap-3">
                  <span className="mt-1.5 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-blue-600"></span>
                  <span>
                    Toda acción técnica, comercial o de mantenimiento debe realizarse bajo supervisión de personal
                    calificado.
                  </span>
                </li>
              </ul>
            </section>

            {/* Sección 4 */}
            <section id="exencion" className="rounded-xl border border-gray-200 bg-white p-8 shadow-sm transition-shadow hover:shadow-md">
              <div className="mb-4 flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-100 text-lg font-bold text-blue-700">
                  4
                </div>
                <h2 className="text-2xl font-bold text-gray-900">Exención de Responsabilidad</h2>
              </div>
              
              <ul className="space-y-3 text-gray-700 leading-relaxed">
                <li className="flex gap-3">
                  <span className="mt-1.5 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-blue-600"></span>
                  <span>
                    Por la propia naturaleza de la herramienta de inteligencia artificial, Argental S.A.I.C. no garantiza
                    que la información esté libre de errores, omisiones o desactualizaciones.
                  </span>
                </li>
                <li className="flex gap-3">
                  <span className="mt-1.5 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-blue-600"></span>
                  <span>
                    No será responsable por daños directos, indirectos, incidentales o consecuentes derivados del mal uso de
                    las respuestas.
                  </span>
                </li>
                <li className="flex gap-3">
                  <span className="mt-1.5 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-blue-600"></span>
                  <span>
                    No garantiza la disponibilidad continua o el funcionamiento ininterrumpido del servicio, que depende de
                    plataformas y servicios de terceros.
                  </span>
                </li>
                <li className="flex gap-3">
                  <span className="mt-1.5 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-blue-600"></span>
                  <span>
                    No asume responsabilidad por interpretaciones erróneas, uso indebido o aplicación incorrecta de la
                    información suministrada.
                  </span>
                </li>
              </ul>
            </section>

            {/* Sección 5 */}
            <section id="privacidad" className="rounded-xl border border-gray-200 bg-white p-8 shadow-sm transition-shadow hover:shadow-md">
              <div className="mb-4 flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-100 text-lg font-bold text-blue-700">
                  5
                </div>
                <h2 className="text-2xl font-bold text-gray-900">Privacidad y Seguridad</h2>
              </div>
              
              <ul className="space-y-3 text-gray-700 leading-relaxed">
                <li className="flex gap-3">
                  <span className="mt-1.5 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-blue-600"></span>
                  <span>Los Agentes Argental no almacenan ni recopilan información personal de los usuarios.</span>
                </li>
                <li className="flex gap-3">
                  <span className="mt-1.5 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-blue-600"></span>
                  <span>
                    Los datos técnicos y documentales se alojan en entornos de nube con estándares internacionales de
                    seguridad y confidencialidad.
                  </span>
                </li>
                <li className="flex gap-3">
                  <span className="mt-1.5 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-blue-600"></span>
                  <span>
                    Argental S.A.I.C. implementa protocolos de protección, autenticación y control de acceso para
                    garantizar la integridad y trazabilidad de la información.
                  </span>
                </li>
              </ul>
            </section>

            {/* Sección 6 */}
            <section id="modificaciones" className="rounded-xl border border-gray-200 bg-white p-8 shadow-sm transition-shadow hover:shadow-md">
              <div className="mb-4 flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-100 text-lg font-bold text-blue-700">
                  6
                </div>
                <h2 className="text-2xl font-bold text-gray-900">Modificaciones</h2>
              </div>
              
              <p className="text-gray-700 leading-relaxed">
                Argental S.A.I.C. se reserva el derecho de modificar, actualizar o complementar esta Política en cualquier
                momento, sin previo aviso. Las versiones actualizadas se publicarán en los mismos entornos donde se ofrece
                acceso a los agentes.
              </p>
            </section>

            {/* Sección 7 */}
            <section id="aceptacion" className="rounded-xl border border-gray-200 bg-white p-8 shadow-sm transition-shadow hover:shadow-md">
              <div className="mb-4 flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-100 text-lg font-bold text-blue-700">
                  7
                </div>
                <h2 className="text-2xl font-bold text-gray-900">Aceptación</h2>
              </div>
              
              <p className="text-gray-700 leading-relaxed">
                El uso de cualquiera de los Agentes Argental implica la aceptación total y sin reservas de esta Política
                de Uso y de las condiciones aquí establecidas.
              </p>
            </section>
          </article>

          {/* Sidebar de navegación */}
          <aside className="lg:sticky lg:top-24 lg:self-start">
            <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
              <h3 className="mb-4 text-sm font-bold uppercase tracking-wide text-gray-900">
                Índice de Contenido
              </h3>
              
              <nav className="space-y-1">
                <a 
                  href="#objeto" 
                  className="block rounded-lg px-3 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-blue-50 hover:text-blue-700"
                >
                  1. Objeto
                </a>
                <a 
                  href="#alcance" 
                  className="block rounded-lg px-3 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-blue-50 hover:text-blue-700"
                >
                  2. Alcance y Limitaciones
                </a>
                <a 
                  href="#usuario" 
                  className="block rounded-lg px-3 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-blue-50 hover:text-blue-700"
                >
                  3. Responsabilidad del Usuario
                </a>
                <a 
                  href="#exencion" 
                  className="block rounded-lg px-3 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-blue-50 hover:text-blue-700"
                >
                  4. Exención de Responsabilidad
                </a>
                <a 
                  href="#privacidad" 
                  className="block rounded-lg px-3 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-blue-50 hover:text-blue-700"
                >
                  5. Privacidad y Seguridad
                </a>
                <a 
                  href="#modificaciones" 
                  className="block rounded-lg px-3 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-blue-50 hover:text-blue-700"
                >
                  6. Modificaciones
                </a>
                <a 
                  href="#aceptacion" 
                  className="block rounded-lg px-3 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-blue-50 hover:text-blue-700"
                >
                  7. Aceptación
                </a>
              </nav>

              <div className="mt-6 border-t border-gray-200 pt-4">
                <a
                  href="/"
                  className="flex w-full items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-all hover:bg-blue-700 hover:shadow"
                >
                  <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
                  </svg>
                  Ir al Inicio
                </a>
              </div>
            </div>
          </aside>
        </div>

        {/* Footer */}
        <footer className="mt-16 rounded-xl border border-gray-200 bg-white p-6 text-center shadow-sm">
          <p className="text-sm text-gray-600">
            © {new Date().getFullYear()} Argental S.A.I.C. — Todos los derechos reservados
          </p>
        </footer>
      </div>
    </main>
  );
}