// =============================================================================
// Catálogo por conversación.
//
// El catálogo (Excel SISTEMAS_PRODUCTIVOS) se lee una sola vez por conversación:
// en el primer mensaje de cada sessionId. Los mensajes siguientes usan esa misma
// copia, así toda la conversación trabaja con la misma versión del Excel.
// Si el Excel cambia en Drive, lo toman las conversaciones nuevas.
//
// La copia se guarda en la memoria del servidor de la web. Si el servidor se
// reinicia (o en Vercel el pedido cae en otra instancia), se vuelve a leer:
// no rompe nada, solo ese mensaje tarda lo mismo que antes.
//
// Las copias que no se usan durante ADVISOR_CATALOGO_CACHE_SEGUNDOS (.env) se
// borran solas. Si la variable no está, se usa 1 hora.
// =============================================================================

import { catalogoDesdeBackend } from "./preparacion/servidor";
import type { Catalogo } from "./excel/types";

/** Tiempo sin uso (en segundos) si ADVISOR_CATALOGO_CACHE_SEGUNDOS no está. */
const SEGUNDOS_POR_DEFECTO = 60 * 60;

/** Tiempo sin uso después del cual se borra la copia de una conversación. */
function segundosSinUso(): number {
  const valor = Number(process.env.ADVISOR_CATALOGO_CACHE_SEGUNDOS);
  return Number.isFinite(valor) && valor > 0 ? valor : SEGUNDOS_POR_DEFECTO;
}

/**
 * Una copia del catálogo por sessionId, con la última vez que se usó.
 *
 * Se guarda en globalThis (y no en una variable del módulo) porque Next.js
 * compila cada ruta por separado: /api/advisor/iniciar y /api/advisor tendrían
 * cada una su propio Map y no verían las copias de la otra. globalThis es único
 * en todo el proceso del servidor, así las dos rutas usan el mismo Map.
 */
type CopiaCatalogo = { catalogo: Catalogo; ultimoUso: number };

const almacenGlobal = globalThis as unknown as {
  __advisorCatalogosPorSesion?: Map<string, CopiaCatalogo>;
};

const copias =
  almacenGlobal.__advisorCatalogosPorSesion ??
  (almacenGlobal.__advisorCatalogosPorSesion = new Map<string, CopiaCatalogo>());

/** Borra las copias de conversaciones que no se usan hace más del límite. */
function limpiarVencidas(ahora: number, limiteMs: number) {
  for (const [sessionId, copia] of copias) {
    if (ahora - copia.ultimoUso > limiteMs) {
      copias.delete(sessionId);
    }
  }
}

/**
 * Devuelve el catálogo de la conversación.
 * - leidoAhora: true si se leyó del backend en este mensaje (primer mensaje de
 *   la conversación), false si se usó la copia guardada.
 */
export async function catalogoDeSesion(
  sessionId: string,
  backend: string
): Promise<{ catalogo: Catalogo; leidoAhora: boolean }> {
  const ahora = Date.now();
  const limiteMs = segundosSinUso() * 1000;

  limpiarVencidas(ahora, limiteMs);

  const copia = copias.get(sessionId);

  if (copia) {
    copia.ultimoUso = ahora;
    return { catalogo: copia.catalogo, leidoAhora: false };
  }

  const catalogo = await catalogoDesdeBackend(backend);

  copias.set(sessionId, { catalogo, ultimoUso: ahora });

  return { catalogo, leidoAhora: true };
}