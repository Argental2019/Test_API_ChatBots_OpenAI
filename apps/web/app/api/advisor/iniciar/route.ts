// =============================================================================
// POST /api/advisor/iniciar
//
// Se llama al abrir el chat del asesor, antes del primer mensaje:
// - lee el catálogo (Excel) y lo guarda como copia de la conversación
//   (lib/advisor/cacheCatalogo.ts);
// - dispara la preparación automática de esquemas y fichas.
//
// Así el primer mensaje del cliente ya no paga la lectura del Excel.
// Mientras esto no termina, la página deja el chat bloqueado.
// =============================================================================

import { urlBackend } from "@/lib/advisor/preparacion/servidor";
import { dispararPreparacion } from "@/lib/advisor/preparacion/disparar";
import { catalogoDeSesion } from "@/lib/advisor/cacheCatalogo";
import { registrarTiempo } from "@/lib/advisor/tiempos";

function respuestaJson(datos: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(datos), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

export async function POST(req: Request) {
  const inicio = Date.now();

  try {
    const body = await req.json().catch(() => null);

    const sessionId =
      typeof body?.sessionId === "string" ? body.sessionId.trim() : "";

    if (!sessionId) {
      return respuestaJson({ ok: false, error: "Falta sessionId" }, 400);
    }

    const backend = urlBackend();

    if (!backend) {
      return respuestaJson(
        { ok: false, error: "No está configurada la URL del backend" },
        500
      );
    }

    // Lee el catálogo una sola vez por conversación. Si ya estaba (por
    // ejemplo, si la página llamó dos veces), usa la copia guardada.
    const { catalogo, leidoAhora } = await catalogoDeSesion(sessionId, backend);

    // La preparación solo hace falta cuando el catálogo se leyó recién.
    if (leidoAhora) {
      await dispararPreparacion(backend, catalogo);
    }

    registrarTiempo(
      sessionId,
      "iniciar chat (catálogo)",
      inicio,
      leidoAhora ? "leído del Excel" : "ya estaba en la conversación"
    );

    return respuestaJson({ ok: true });
  } catch (error) {
    console.error("ERROR /api/advisor/iniciar:", error);

    return respuestaJson(
      {
        ok: false,
        error:
          error instanceof Error
            ? error.message
            : "No se pudo iniciar el asesor",
      },
      500
    );
  }
}