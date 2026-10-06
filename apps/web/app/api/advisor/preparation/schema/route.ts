// =============================================================================
// POST /api/advisor/preparation/schema
//
// Genera el esquema de un tipo de equipo (Prompt 1) con TODAS sus máquinas:
//   1. Lee el Excel desde el backend (GET /advisor/excel).
//   2. Busca las máquinas del tipo pedido (columna "Tipo de equipo").
//   3. Resuelve las carpetas de Drive de cada una con agents.ts, sin la
//      carpeta común "Info pública general".
//   4. Llama al backend (POST /advisor/preparation/schema), que lee la
//      documentación, ejecuta el Prompt 1 y guarda el esquema en Redis.
//
// Body: { "tipoEquipo": "AMASADORA", "force": true }
// Header obligatorio: x-admin-token (igual a la variable ADMIN_TOKEN).
//
// No modifica el asesor actual (/api/advisor) ni los agentes individuales.
// =============================================================================

import { NextRequest, NextResponse } from "next/server";
import { getAgentById } from "../../../../../lib/agents";
import { maquinasDeTipo, tiposDeEquipo } from "../../../../../lib/advisor/preparacion/maquinasDeTipo";
import { carpetasExcluidas, catalogoDesdeBackend, errorDeAcceso, urlBackend } from "../../../../../lib/advisor/preparacion/servidor";

export const runtime = "nodejs"; // necesita llamadas largas al backend; no corre en edge
export const dynamic = "force-dynamic"; // nunca se cachea
export const maxDuration = 300; // el Prompt 1 con todas las máquinas puede tardar (límite según plan de Vercel)

const error = (status: number, mensaje: string, extra: Record<string, unknown> = {}) =>
  NextResponse.json({ ok: false, error: mensaje, ...extra }, { status });

export async function POST(req: NextRequest) {
  // 1) Acceso: solo uso interno.
  const acceso = errorDeAcceso(req);
  if (acceso) return error(acceso.status, acceso.mensaje);

  // 2) Datos del pedido.
  let body: { tipoEquipo?: unknown; force?: unknown };
  try {
    body = await req.json();
  } catch {
    return error(400, "El body tiene que ser JSON.");
  }
  const tipoPedido = typeof body.tipoEquipo === "string" ? body.tipoEquipo.trim() : "";
  const force = body.force === true;
  if (!tipoPedido) return error(400, 'Falta "tipoEquipo" en el body.');

  const backend = urlBackend();
  if (!backend) return error(500, "Falta la URL del backend (BACKEND_URL, BACKEND_BASE_URL o NEXT_PUBLIC_BACKEND_URL).");

  // 3) Excel → catálogo → máquinas del tipo, con sus carpetas.
  let catalogo;
  try {
    catalogo = await catalogoDesdeBackend(backend);
  } catch (e: any) {
    return error(502, e?.message || "No se pudo leer el Excel.");
  }
  const seleccion = maquinasDeTipo(catalogo, tipoPedido, (id) => getAgentById(id), carpetasExcluidas());
  if (seleccion.maquinas.length === 0) {
    return error(422, `No hay máquinas utilizables del tipo "${tipoPedido}".`, {
      tiposDisponibles: tiposDeEquipo(catalogo),
      omitidas: seleccion.omitidas,
    });
  }

  // 4) Backend: documentación + Prompt 1 + Redis.
  const respEsquema = await fetch(`${backend}/advisor/preparation/schema`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ tipoEquipo: seleccion.tipoEquipo, maquinas: seleccion.maquinas, force }),
    cache: "no-store",
  });
  const texto = await respEsquema.text();
  let esquema: unknown = texto;
  try {
    esquema = JSON.parse(texto);
  } catch {
    // Si el backend no devolvió JSON, se devuelve el texto tal cual para diagnosticar.
  }

  return NextResponse.json(
    {
      ok: respEsquema.ok,
      versionExcel: catalogo.version,
      tipoEquipo: seleccion.tipoEquipo,
      maquinas: seleccion.maquinas.map((m) => ({ idBusquetti: m.idBusquetti, nombreModelo: m.nombreModelo, carpetas: m.driveFolders.length })),
      omitidas: seleccion.omitidas,
      esquema,
    },
    { status: respEsquema.ok ? 200 : 502 },
  );
}