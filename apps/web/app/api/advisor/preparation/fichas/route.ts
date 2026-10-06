// =============================================================================
// POST /api/advisor/preparation/fichas
//
// Genera las fichas (Prompt 2) de TODAS las máquinas de un tipo de equipo:
//   1. Lee el Excel y busca las máquinas del tipo (columna "Tipo de equipo").
//   2. Resuelve las carpetas de cada una con agents.ts, sin la carpeta común.
//   3. Llama al backend (POST /advisor/preparation/ficha) por cada máquina,
//      de a pocas en paralelo.
//   4. Devuelve un resumen por máquina.
//
// Requisito: el esquema del tipo tiene que existir (POST .../preparation/schema).
//
// Body: { "tipoEquipo": "HORNO RAPIDO", "force": false, "incluirFichas": false }
// - force: true regenera todas aunque estén vigentes.
// - incluirFichas: true devuelve además la ficha completa de cada máquina.
// Header obligatorio: x-admin-token (igual a la variable ADMIN_TOKEN).
// =============================================================================

import { NextRequest, NextResponse } from "next/server";

import { getAgentById } from "@/lib/agents";

import {
  maquinasDeTipo,
  tiposDeEquipo,
  type MaquinaParaPreparacion,
} from "@/lib/advisor/preparacion/maquinasDeTipo";

import {
  carpetasExcluidas,
  catalogoDesdeBackend,
  errorDeAcceso,
  urlBackend,
} from "@/lib/advisor/preparacion/servidor";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300; // varias llamadas a la IA; límite según plan de Vercel

// Fichas que se generan al mismo tiempo. Pocas, para no saturar OpenAI.
const CONCURRENCIA = 2;

const error = (status: number, mensaje: string, extra: Record<string, unknown> = {}) =>
  NextResponse.json({ ok: false, error: mensaje, ...extra }, { status });

/** Resultado de una máquina, resumido para leerlo rápido. */
interface ResumenMaquina {
  idBusquetti: string;
  nombreModelo: string;
  ok: boolean;
  estado: string | null; // "generada" | "vigente" | null si hubo error
  camposConValor: number | null;
  camposSinValor: number | null;
  avisos: number | null;
  error: string | null;
  ficha?: unknown;
}

/** Ejecuta fn sobre cada elemento con un máximo de tareas en paralelo. */
async function procesarConLimite<T, R>(elementos: T[], limite: number, fn: (e: T) => Promise<R>): Promise<R[]> {
  const resultados: R[] = new Array(elementos.length);
  let siguiente = 0;
  const trabajador = async () => {
    while (siguiente < elementos.length) {
      const i = siguiente++;
      resultados[i] = await fn(elementos[i]);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limite, elementos.length) }, trabajador));
  return resultados;
}

/** Pide al backend la ficha de una máquina y la resume. */
async function generarFicha(
  backend: string,
  tipoEquipo: string,
  maquina: MaquinaParaPreparacion,
  force: boolean,
  incluirFicha: boolean,
): Promise<ResumenMaquina> {
  const base = { idBusquetti: maquina.idBusquetti, nombreModelo: maquina.nombreModelo };
  try {
    const resp = await fetch(`${backend}/advisor/preparation/ficha`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tipoEquipo, maquina, force }),
      cache: "no-store",
    });
    const texto = await resp.text();
    let datos: any;
    try {
      datos = JSON.parse(texto);
    } catch {
      datos = { error: texto };
    }
    if (!resp.ok) {
      return { ...base, ok: false, estado: null, camposConValor: null, camposSinValor: null, avisos: null, error: datos?.error || `Error ${resp.status}` };
    }

    const valores: Record<string, unknown> = datos?.ficha?.valores || {};
    const conValor = Object.values(valores).filter((v) => v !== null).length;
    return {
      ...base,
      ok: true,
      estado: datos?.estado ?? null,
      camposConValor: conValor,
      camposSinValor: Object.keys(valores).length - conValor,
      avisos: Array.isArray(datos?.ficha?.avisos) ? datos.ficha.avisos.length : 0,
      error: null,
      ...(incluirFicha ? { ficha: datos?.ficha } : {}),
    };
  } catch (e: any) {
    return { ...base, ok: false, estado: null, camposConValor: null, camposSinValor: null, avisos: null, error: e?.message || String(e) };
  }
}

export async function POST(req: NextRequest) {
  // 1) Acceso.
  const acceso = errorDeAcceso(req);
  if (acceso) return error(acceso.status, acceso.mensaje);

  // 2) Datos del pedido.
  let body: { tipoEquipo?: unknown; force?: unknown; incluirFichas?: unknown };
  try {
    body = await req.json();
  } catch {
    return error(400, "El body tiene que ser JSON.");
  }
  const tipoPedido = typeof body.tipoEquipo === "string" ? body.tipoEquipo.trim() : "";
  const force = body.force === true;
  const incluirFichas = body.incluirFichas === true;
  if (!tipoPedido) return error(400, 'Falta "tipoEquipo" en el body.');

  const backend = urlBackend();
  if (!backend) return error(500, "Falta la URL del backend (BACKEND_URL, BACKEND_BASE_URL o NEXT_PUBLIC_BACKEND_URL).");

  // 3) Máquinas del tipo.
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

  // 4) Fichas, de a pocas en paralelo.
  const resultados = await procesarConLimite(seleccion.maquinas, CONCURRENCIA, (maquina) =>
    generarFicha(backend, seleccion.tipoEquipo, maquina, force, incluirFichas),
  );

  const conError = resultados.filter((r) => !r.ok).length;
  return NextResponse.json(
    {
      ok: conError === 0,
      versionExcel: catalogo.version,
      tipoEquipo: seleccion.tipoEquipo,
      resumen: {
        maquinas: resultados.length,
        generadas: resultados.filter((r) => r.estado === "generada").length,
        vigentes: resultados.filter((r) => r.estado === "vigente").length,
        conError,
      },
      resultados,
      omitidas: seleccion.omitidas,
    },
    { status: conError === resultados.length ? 502 : 200 },
  );
}