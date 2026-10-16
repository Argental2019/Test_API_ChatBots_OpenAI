// =============================================================================
// Preparación automática de esquemas y fichas.
//
// Envía al backend todas las máquinas del Excel que tienen agente. El backend
// responde enseguida y, si falta algún esquema o ficha, lo genera en segundo
// plano. Nunca frena la conversación: si falla, solo queda en el log.
//
// La usan /api/advisor (si el catálogo se lee en un mensaje) y
// /api/advisor/iniciar (al abrir el chat).
// =============================================================================

import { getAgentById } from "@/lib/agents";
import { carpetasExcluidas } from "./servidor";
import { maquinasDeTipo, tiposDeEquipo } from "./maquinasDeTipo";

export async function dispararPreparacion(
  backend: string,
  catalogo: any
) {
  try {
    const excluidas = carpetasExcluidas();

    const maquinas = tiposDeEquipo(catalogo).flatMap((tipo) => {
      const resultado = maquinasDeTipo(
        catalogo,
        tipo,
        (id: string) => (getAgentById(id) as any) ?? undefined,
        excluidas
      );

      return resultado.maquinas.map((maquina) => ({
        ...maquina,
        tipoEquipo: resultado.tipoEquipo,
      }));
    });

    if (maquinas.length === 0) {
      return;
    }

    const respuesta = await fetch(
      `${backend}/advisor/preparation/auto`,
      {
        method: "POST",

        headers: {
          "Content-Type": "application/json",
        },

        body: JSON.stringify({
          maquinas,
        }),

        signal: AbortSignal.timeout(5000),
      }
    );

    const datos = await respuesta.json().catch(() => null);

    if (datos?.estado && datos.estado !== "completa") {
      console.log(
        "PREPARACION AUTOMATICA:",
        datos.estado
      );
    }
  } catch (error) {
    console.warn(
      "No se pudo disparar la preparación automática:",
      error instanceof Error ? error.message : error
    );
  }
}