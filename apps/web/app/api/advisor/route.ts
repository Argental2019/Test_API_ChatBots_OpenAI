// apps/web/app/api/advisor/route.ts

import { getAgentById } from "@/lib/agents";
import { armarCandidatos } from "@/lib/advisor/excel/armarcandidatos";
import { urlBackend } from "@/lib/advisor/preparacion/servidor";
import { dispararPreparacion } from "@/lib/advisor/preparacion/disparar";
import { registrarTiempo } from "@/lib/advisor/tiempos";
import { catalogoDeSesion } from "@/lib/advisor/cacheCatalogo";

type MensajeFront = {
  role: "user" | "assistant";
  content: string;
};

type MensajeHistorial = {
  rol: "cliente" | "asesor";
  contenido: string;
};

// -----------------------------------------------------------------------------
// RESPUESTA SSE
// -----------------------------------------------------------------------------
//
// page.tsx ya consume la respuesta como un stream compatible con el formato
// choices[0].delta.content.
//
// Para Prompt 4 y Prompt 5 no necesitamos streaming real de OpenAI.
// Enviamos el mensaje completo como un único delta SSE.
//

function respuestaSSE(texto: string) {
  const chunk = {
    id: "advisor",
    object: "chat.completion.chunk",
    choices: [
      {
        index: 0,
        delta: {
          content: texto,
        },
        finish_reason: null,
      },
    ],
  };

  const fin = {
    id: "advisor",
    object: "chat.completion.chunk",
    choices: [
      {
        index: 0,
        delta: {},
        finish_reason: "stop",
      },
    ],
  };

  const body = [
    `data: ${JSON.stringify(chunk)}`,
    "",
    `data: ${JSON.stringify(fin)}`,
    "",
    "data: [DONE]",
    "",
  ].join("\n");

  return new Response(body, {
    status: 200,
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}

// -----------------------------------------------------------------------------
// RESPUESTA SSE EN STREAMING (DIAGNÓSTICO TERMINADO → RECOMENDACIÓN)
// -----------------------------------------------------------------------------
//
// Cuando el diagnóstico termina, la respuesta a la página se abre enseguida
// como stream y se va completando:
//
// 1. "advisor_aviso": el mensaje de diagnóstico completo. page.tsx lo muestra
//    en su propio globo y abre otro globo (vacío, con indicador de "comparando")
//    para la recomendación.
// 2. Mientras tanto se arman candidatos, fichas y la comparación (Prompt 5).
// 3. La recomendación (Prompt 6A) llega del backend como NDJSON (una línea
//    JSON por evento: "delta", "fin" o "error") y se pasa a la página pedazo a
//    pedazo, en el mismo formato choices[0].delta.content.
//    - Si un tag [RECOMENDAR:...] llega cortado entre dos pedazos, se retiene
//      hasta que llega completo, para que no se vea en pantalla.
// 4. "advisor_final": el mensaje ya validado por el backend. page.tsx
//    reemplaza lo que mostró por ese texto.
//
// Si algo falla en el medio, se manda "advisor_final" con un mensaje de error
// (ya no se puede responder un error HTTP porque el stream está abierto).
//

// Mensaje que ve el cliente apenas termina el diagnóstico.
const MENSAJE_DIAGNOSTICO_COMPLETO =
  "¡Listo, ya tengo todo lo que necesito! Ahora voy a comparar los equipos y armar tu recomendación. Puede tardar menos de un minuto.";

const MENSAJE_ERROR_RECOMENDACION =
  "No pude terminar de armar la recomendación. Probá de nuevo en unos segundos.";

function chunkSSE(
  delta: Record<string, unknown>,
  finishReason: string | null = null
) {
  const chunk = {
    id: "advisor",
    object: "chat.completion.chunk",
    choices: [{ index: 0, delta, finish_reason: finishReason }],
  };

  return `data: ${JSON.stringify(chunk)}\n\n`;
}

/** Lo que el proceso puede mandarle a la página mientras corre. */
type CanalRecomendacion = {
  /** Mensaje en su propio globo (diagnóstico completo). */
  aviso: (texto: string) => void;

  /** Mensaje final del globo de la recomendación (reemplaza lo mostrado). */
  final: (texto: string) => void;

  /**
   * Pasa a la página la recomendación que el backend manda como NDJSON.
   * Devuelve true si llegó completa (evento "fin").
   */
  pasarRecomendacion: (cuerpo: ReadableStream<Uint8Array>) => Promise<boolean>;
};

/**
 * Abre el stream hacia la página y corre "proceso" adentro.
 * "proceso" devuelve cómo terminó (para el archivo de tiempos); al final se
 * llama a "alTerminar" con ese resultado.
 */
function respuestaSSEProceso(
  proceso: (canal: CanalRecomendacion) => Promise<string>,
  alTerminar: (resultado: string) => void
) {
  const encoder = new TextEncoder();

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const enviar = (texto: string) =>
        controller.enqueue(encoder.encode(texto));

      const emitirTexto = (texto: string) => {
        if (texto) enviar(chunkSSE({ content: texto }));
      };

      const canal: CanalRecomendacion = {
        aviso: (texto) => enviar(chunkSSE({ advisor_aviso: texto })),

        final: (texto) => enviar(chunkSSE({ advisor_final: texto })),

        pasarRecomendacion: async (cuerpo) => {
          const decoder = new TextDecoder("utf-8");
          const reader = cuerpo.getReader();
          let buf = "";
          let pendiente = "";
          let terminoBien = false;

          const procesar = (linea: string) => {
            if (!linea.trim()) return;

            let evento: any;

            try {
              evento = JSON.parse(linea);
            } catch {
              return;
            }

            if (evento.tipo === "delta") {
              pendiente += String(evento.texto || "");

              // Si hay un "[" sin su "]", se retiene desde ahí (tag a medio llegar).
              const corte = pendiente.lastIndexOf("[");

              if (corte >= 0 && !pendiente.includes("]", corte)) {
                emitirTexto(pendiente.slice(0, corte));
                pendiente = pendiente.slice(corte);
              } else {
                emitirTexto(pendiente);
                pendiente = "";
              }
            } else if (evento.tipo === "fin") {
              terminoBien = true;
              pendiente = "";
              canal.final(String(evento.mensajeCliente || ""));
            } else if (evento.tipo === "error") {
              console.error("ERROR RECOMENDACION (streaming):", evento.error);
            }
          };

          try {
            while (true) {
              const { value, done } = await reader.read();
              if (done) break;

              buf += decoder.decode(value, { stream: true });

              let idx: number;
              while ((idx = buf.indexOf("\n")) >= 0) {
                procesar(buf.slice(0, idx));
                buf = buf.slice(idx + 1);
              }
            }

            buf += decoder.decode();
            procesar(buf);
          } catch (error) {
            console.error("ERROR leyendo la recomendación del backend:", error);
          }

          return terminoBien;
        },
      };

      let resultado = "error en la recomendación";

      try {
        resultado = await proceso(canal);
      } catch (error) {
        console.error("ERROR /api/advisor (recomendación):", error);
        canal.final(MENSAJE_ERROR_RECOMENDACION);
      } finally {
        enviar(chunkSSE({}, "stop"));
        enviar("data: [DONE]\n\n");
        controller.close();
        alTerminar(resultado);
      }
    },
  });

  return new Response(stream, {
    status: 200,
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
// -----------------------------------------------------------------------------
// RESPUESTA DE ERROR
// -----------------------------------------------------------------------------

function respuestaError(
  error: string,
  status = 500,
  extra: Record<string, unknown> = {}
) {
  return new Response(
    JSON.stringify({
      ok: false,
      error,
      ...extra,
    }),
    {
      status,
      headers: {
        "Content-Type": "application/json",
      },
    }
  );
}

// -----------------------------------------------------------------------------
// HISTORIAL
// -----------------------------------------------------------------------------
//
// El frontend usa:
// user / assistant
//
// Los prompts del nuevo Asesor Integral usan:
// cliente / asesor
//

function convertirHistorial(
  messages: MensajeFront[]
): MensajeHistorial[] {
  return messages.map((mensaje) => ({
    rol: mensaje.role === "user" ? "cliente" : "asesor",
    contenido: mensaje.content,
  }));
}

// -----------------------------------------------------------------------------
// CARPETAS EXCLUIDAS DE LAS FICHAS
// -----------------------------------------------------------------------------
//
// La carpeta común de "Info pública general" no debe participar en Prompt 1 / 2.
// El listado viene del .env del web.
//
// Puede contener más de una carpeta separada por coma.
//

function obtenerCarpetasExcluidas() {
  return new Set(
    (process.env.ADVISOR_CARPETAS_EXCLUIDAS || "")
      .split(",")
      .map((valor) => valor.trim())
      .filter(Boolean)
  );
}

export async function POST(req: Request) {
  // Medición de tiempos (archivo de tiempos, ver lib/advisor/tiempos.ts).
  // Al terminar el pedido (en el finally) se registra el TOTAL del mensaje,
  // con cómo terminó: pregunta, repregunta, recomendación o error.
  const inicioMensaje = Date.now();
  let sesionTiempos = "";
  let numeroMensaje = 0;
  let resultadoMensaje = "error";
  // Si la respuesta sale en streaming, el TOTAL se registra cuando termina
  // el stream (no en el finally, que corre apenas empieza a mandarse).
  let totalEnStream = false;
  try {
    // -------------------------------------------------------------------------
    // 1. BODY DEL FRONTEND
    // -------------------------------------------------------------------------

    const body = await req.json();

    const sessionId =
      typeof body?.sessionId === "string"
        ? body.sessionId.trim()
        : "";

    const messages: MensajeFront[] = Array.isArray(body?.messages)
      ? body.messages
      : [];

    if (!sessionId) {
      return respuestaError(
        "Falta sessionId",
        400
      );
    }

    if (messages.length === 0) {
      return respuestaError(
        "Falta messages",
        400
      );
    }

    sesionTiempos = sessionId;
    numeroMensaje = messages.filter(
      (mensaje) => mensaje.role === "user"
    ).length;

    // -------------------------------------------------------------------------
    // 2. BACKEND
    // -------------------------------------------------------------------------

    const backend = String(urlBackend()).replace(
      /\/+$/,
      ""
    );

    // -------------------------------------------------------------------------
    // 3. CATÁLOGO
    // -------------------------------------------------------------------------
    //
    // Se obtiene desde el Excel real.
    //
    // De acá salen:
    // - productos válidos
    // - etapas válidas
    // - tope kg harina/día
    // - equipos
    // - sistemas productivos
    //

        const inicioCatalogo = Date.now();

    // Se lee una sola vez por conversación (primer mensaje); después se usa
    // la copia guardada. Ver lib/advisor/cacheCatalogo.ts.
    const { catalogo, leidoAhora } = await catalogoDeSesion(
      sessionId,
      backend
    );

    registrarTiempo(
      sessionId,
      leidoAhora
        ? "leer catálogo (Excel)"
        : "catálogo (copia de la conversación)",
      inicioCatalogo
    );

    if (!catalogo) {
      return respuestaError(
        "No se pudo obtener el catálogo del asesor"
      );
    }

    if (
      catalogo.topeKgHarinaDia === null ||
      catalogo.topeKgHarinaDia === undefined
    ) {
      return respuestaError(
        "El catálogo no tiene definido topeKgHarinaDia"
      );
    }

        // -------------------------------------------------------------------------
    // 3B. PREPARACIÓN AUTOMÁTICA
    // -------------------------------------------------------------------------

    const inicioPreparacion = Date.now();

    await dispararPreparacion(backend, catalogo);

    registrarTiempo(
      sessionId,
      "disparar preparación",
      inicioPreparacion
    );
    // -------------------------------------------------------------------------
    // 4. HISTORIAL
    // -------------------------------------------------------------------------

    const historial = convertirHistorial(messages);

        // -------------------------------------------------------------------------
    // 4B. REPREGUNTAS DESPUÉS DE LA RECOMENDACIÓN (PROMPT 6B)
    // -------------------------------------------------------------------------
    //
    // Si la sesión todavía no tiene una recomendación, el backend responde
    // "no_aplica" enseguida y se sigue con el diagnóstico.
    //
    // Si ya la tiene:
    // - "responder" / "sin_evidencia": se muestra la respuesta y termina.
    // - "recalcular" / "rediagnosticar": se sigue el flujo normal. El
    //   diagnóstico relee la conversación con el dato nuevo y se rehacen la
    //   comparación y la recomendación.
    //

    const inicioFollowup = Date.now();

    const followupResponse = await fetch(
      `${backend}/advisor/followup`,
      {
        method: "POST",

        headers: {
          "Content-Type": "application/json",
        },

        body: JSON.stringify({
          sessionId,
          historial,
        }),
      }
    );

    let followup: any;

    try {
      followup = await followupResponse.json();
    } catch {
      return respuestaError(
        "El backend devolvió una respuesta inválida en la repregunta"
      );
    }

    if (
      !followupResponse.ok ||
      !followup?.ok
    ) {
      return respuestaError(
        followup?.error ||
          "Error procesando la repregunta",
        followupResponse.status || 500,
        {
          followup,
        }
      );
    }

    registrarTiempo(
      sessionId,
      "followup / 6B (llamada completa)",
      inicioFollowup,
      followup?.accion || ""
    );

    if (followup.accion !== "no_aplica") {
      console.log(
        "REPREGUNTA DEL ASESOR:",
        JSON.stringify(followup, null, 2)
      );
    }

    if (
      followup.accion === "responder" ||
      followup.accion === "sin_evidencia"
    ) {
      resultadoMensaje = `repregunta (${followup.accion})`;

      return respuestaSSE(
        followup.mensajeCliente
      );
    }

    // -------------------------------------------------------------------------
    // 5. PROMPT 3 + PROMPT 4
    // -------------------------------------------------------------------------
    //
    // El backend:
    //
    // - recupera la sesión desde Redis
    // - ejecuta Prompt 3
    // - calcula obligatorias pendientes
    // - evalúa opcionales
    // - ejecuta Prompt 4 si el diagnóstico continúa
    //

    const inicioDiagnostico = Date.now();

    const diagnosisResponse = await fetch(
      `${backend}/advisor/diagnosis/analyze`,
      {
        method: "POST",

        headers: {
          "Content-Type": "application/json",
        },

        body: JSON.stringify({
          sessionId,

          productosValidos: catalogo.productos,

          etapasValidas: catalogo.etapas.map(
            (etapa: any) => etapa.nombre
          ),

          topeKgHarinaDia:
            catalogo.topeKgHarinaDia,

          historial,
        }),
      }
    );

    let diagnosis: any;

    try {
      diagnosis = await diagnosisResponse.json();
    } catch {
      return respuestaError(
        "El backend devolvió una respuesta inválida durante el diagnóstico"
      );
    }

    registrarTiempo(
      sessionId,
      "diagnóstico (llamada completa)",
      inicioDiagnostico
    );

    console.log(
      "DIAGNOSTICO NUEVO:",
      JSON.stringify(diagnosis, null, 2)
    );

    if (
      !diagnosisResponse.ok ||
      !diagnosis?.ok
    ) {
      return respuestaError(
        diagnosis?.error ||
          "Error ejecutando el diagnóstico",
        diagnosisResponse.status || 500,
        {
          diagnosis,
        }
      );
    }

    // -------------------------------------------------------------------------
    // 6. SI EL DIAGNÓSTICO TODAVÍA SIGUE
    // -------------------------------------------------------------------------

    if (diagnosis.diagnosticoSigue) {
      if (!diagnosis.mensajeCliente) {
        return respuestaError(
          "El diagnóstico continúa pero Prompt 4 no devolvió mensajeCliente"
        );
      }

      resultadoMensaje = "pregunta del diagnóstico";

      return respuestaSSE(
        diagnosis.mensajeCliente
      );
    }

    // -------------------------------------------------------------------------
    // 7. DIAGNÓSTICO TERMINADO
    // -------------------------------------------------------------------------

    if (!diagnosis?.registro?.busqueda) {
      return respuestaError(
        "El diagnóstico terminó pero no devolvió registro.busqueda"
      );
    }

    // -------------------------------------------------------------------------
    // 7B. DESDE ACÁ, LA RESPUESTA VA EN STREAMING
    // -------------------------------------------------------------------------
    //
    // El diagnóstico terminó: se abre el stream hacia la página, se manda el
    // aviso de diagnóstico completo y el resto (candidatos, fichas, Prompt 5 y
    // Prompt 6A) corre adentro del stream. El TOTAL del mensaje se registra
    // cuando termina el stream (no en el finally).
    //

    const busqueda = diagnosis.registro.busqueda;

    totalEnStream = true;

    return respuestaSSEProceso(
      async (canal) => {
        canal.aviso(MENSAJE_DIAGNOSTICO_COMPLETO);

        // Error dentro del stream: se loguea y el cliente ve un mensaje.
        const fallar = (mensaje: string, detalle: unknown = null) => {
          console.error("ERROR RECOMENDACION:", mensaje, detalle ?? "");
          canal.final(MENSAJE_ERROR_RECOMENDACION);
          return `error: ${mensaje}`;
        };

        // ---------------------------------------------------------------------
        // 8. ARMAR CANDIDATOS
        // ---------------------------------------------------------------------
        //
        // Se mantiene la validación que ya usamos:
        // un candidato tiene que tener agente individual existente.
        //

        const inicioCandidatos = Date.now();

        const candidatos = armarCandidatos(
          catalogo,

          busqueda,

          (id: string) =>
            Boolean(getAgentById(id))
        );

        registrarTiempo(
          sessionId,
          "armar candidatos",
          inicioCandidatos
        );

        console.log(
          "CANDIDATOS DEL ASESOR:",
          JSON.stringify(candidatos, null, 2)
        );

        if (
          !candidatos ||
          !Array.isArray(candidatos.etapas)
        ) {
          return fallar("No se pudieron armar los candidatos");
        }

        // ---------------------------------------------------------------------
        // 9. ARMAR LISTA ÚNICA DE MÁQUINAS PARA PEDIR SUS FICHAS
        // ---------------------------------------------------------------------

        const carpetasExcluidas =
          obtenerCarpetasExcluidas();

        const maquinasPorId = new Map<
          string,
          {
            idBusquetti: string;
            nombreModelo: string;
            tipoEquipo: string;
            driveFolders: string[];
          }
        >();

        for (const etapa of candidatos.etapas) {
          for (
            const opcion of etapa.opciones || []
          ) {
            for (
              const equipo of opcion.equipos || []
            ) {
              const id = String(
                equipo?.id || ""
              ).trim();

              if (!id) {
                continue;
              }

              // Ya debería existir porque armarCandidatos()
              // lo validó, pero lo verificamos nuevamente
              // antes de usar sus carpetas.
              const agente = getAgentById(id);

              if (!agente) {
                console.warn(
                  `No se encontró agente para ${id}`
                );

                continue;
              }

              const driveFolders = (
                agente.driveFolders || []
              ).filter(
                (folderId: string) =>
                  !carpetasExcluidas.has(folderId)
              );

              maquinasPorId.set(id, {
                idBusquetti: id,

                nombreModelo:
                  equipo.nombreComercial || id,

                tipoEquipo:
                  equipo.tipoEquipo || "",

                driveFolders,
              });
            }
          }
        }

        const maquinas = Array.from(
          maquinasPorId.values()
        );

        console.log(
          "IDS CANDIDATOS:",
          maquinas.map(
            (maquina) => maquina.idBusquetti
          )
        );

        if (maquinas.length === 0) {
          return fallar("El diagnóstico terminó pero no hay máquinas candidatas válidas");
        }

        // ---------------------------------------------------------------------
        // 10. PEDIR FICHAS AL BACKEND
        // ---------------------------------------------------------------------
        //
        // /advisor/fichas:
        //
        // - devuelve ficha vigente si no cambió
        // - devuelve anterior y actualiza si cambió
        // - genera ficha si todavía no existe
        //

        const inicioFichas = Date.now();

        const fichasResponse = await fetch(
          `${backend}/advisor/fichas`,
          {
            method: "POST",

            headers: {
              "Content-Type": "application/json",
            },

            body: JSON.stringify({
              maquinas,
            }),
          }
        );

        let fichasJson: any;

        try {
          fichasJson =
            await fichasResponse.json();
        } catch {
          return fallar("El backend devolvió una respuesta inválida al pedir las fichas");
        }

        registrarTiempo(
          sessionId,
          "pedir fichas (llamada completa)",
          inicioFichas,
          `${maquinas.length} máquinas`
        );

        console.log(
          "FICHAS DEL ASESOR:",
          JSON.stringify(fichasJson, null, 2)
        );

        if (
          !fichasResponse.ok ||
          !Array.isArray(fichasJson?.resultados)
        ) {
          return fallar(
            fichasJson?.error ||
              "Error obteniendo las fichas de los candidatos",
            fichasJson
          );
        }

        // ---------------------------------------------------------------------
        // 11. INDEXAR LAS FICHAS POR ID BUSQUETTI
        // ---------------------------------------------------------------------

        const fichaPorId = new Map<
          string,
          any
        >();

        for (
          const resultado of
          fichasJson.resultados || []
        ) {
          const id = String(
            resultado?.idBusquetti || ""
          ).trim();

          if (!id) {
            continue;
          }

          fichaPorId.set(
            id,
            resultado?.ficha || null
          );
        }

        // ---------------------------------------------------------------------
        // 12. INSERTAR LA FICHA EN CADA EQUIPO CANDIDATO
        // ---------------------------------------------------------------------
        //
        // A Prompt 5 no le hace falta:
        //
        // - nombre del archivo
        // - fuentes
        // - metadata de Drive
        // - huellas
        //
        // Solamente los valores y sus estados.
        //
        // Esto además reduce bastante el tamaño del prompt.
        //

        const candidatosConFichas =
          candidatos.etapas.map(
            (etapa: any) => ({
              ...etapa,

              opciones: (
                etapa.opciones || []
              ).map((opcion: any) => ({
                ...opcion,

                equipos: (
                  opcion.equipos || []
                ).map((equipo: any) => {
                  const ficha =
                    fichaPorId.get(
                      equipo.id
                    );

                  return {
                    ...equipo,

                    ficha: {
                      valores:
                        ficha?.valores || {},
                    },
                  };
                }),
              })),
            })
          );

        console.log(
          "CANDIDATOS CON FICHAS:",
          JSON.stringify(
            candidatosConFichas,
            null,
            2
          )
        );

        // ---------------------------------------------------------------------
        // 13. PROMPT 5 - COMPARACIÓN
        // ---------------------------------------------------------------------
        //
        // Prompt 5 recibe:
        //
        // - sessionId
        // - candidatos + fichas
        // - historial completo
        // - máximo de preguntas
        //
        // El backend recupera de Redis:
        //
        // - diagnóstico
        // - datos ya obtenidos durante comparación
        // - cantidad de preguntas realizadas
        //
        console.log(">>> ANTES DE PROMPT 5");

        const inicioComparacion = Date.now();

        const comparacionResponse =
          await fetch(
            `${backend}/advisor/comparison/analyze`,
            {
              method: "POST",

              headers: {
                "Content-Type":
                  "application/json",
              },

              body: JSON.stringify({
                sessionId,

                candidatos:
                  candidatosConFichas,

                historial,

                maxPreguntasComparacion: 3,
              }),
            }
          );

        console.log(
          ">>> RESPUESTA HTTP PROMPT 5:",
          comparacionResponse.status
        );

        registrarTiempo(
          sessionId,
          "comparación (llamada completa)",
          inicioComparacion
        );

        let comparacion: any;

        try {
          comparacion =
            await comparacionResponse.json();
        } catch {
          return fallar("El backend devolvió una respuesta inválida durante la comparación");
        }

        console.log(
          ">>> PROMPT 5 PARSEADO:",
          comparacion?.ok,
          comparacion?.accion,
          comparacion?.mensajeCliente
        );

        console.log(
          "COMPARACION DEL ASESOR:",
          JSON.stringify(
            comparacion,
            null,
            2
          )
        );

        if (
          !comparacionResponse.ok ||
          !comparacion?.ok
        ) {
          return fallar(
            comparacion?.error ||
              "Error ejecutando la comparación de equipos",
            comparacion
          );
        }

        // ---------------------------------------------------------------------
        // 14. PROMPT 6A - RECOMENDACIÓN
        // ---------------------------------------------------------------------
        //
        // La comparación ya quedó guardada en la sesión.
        // Mandamos los candidatos (nombres, marcas y fichas) porque la sesión
        // todavía no los tiene; el backend los guarda para el Prompt 6B.
        //

        if (
          comparacion.accion === "listo"
        ) {
          const inicioRecomendacion = Date.now();

          const recomendacionResponse = await fetch(
            `${backend}/advisor/recommendation/generate`,
            {
              method: "POST",

              headers: {
                "Content-Type": "application/json",
              },

              body: JSON.stringify({
                sessionId,
                candidatos: candidatosConFichas,
                stream: true,
              }),
            }
          );

          const tipoContenido =
            recomendacionResponse.headers.get("content-type") || "";

          // Si el backend falló antes de empezar a escribir, responde un JSON
          // de error (no NDJSON).
          if (
            !recomendacionResponse.ok ||
            !recomendacionResponse.body ||
            !tipoContenido.includes("ndjson")
          ) {
            const recomendacion = await recomendacionResponse
              .json()
              .catch(() => null);

            return fallar(
              recomendacion?.error || "Error generando la recomendación",
              recomendacion
            );
          }

          // La recomendación se pasa a la página a medida que se escribe.
          const terminoBien = await canal.pasarRecomendacion(
            recomendacionResponse.body
          );

          registrarTiempo(
            sessionId,
            "recomendación (llamada completa)",
            inicioRecomendacion
          );

          if (!terminoBien) {
            return fallar("La recomendación se cortó antes de terminar");
          }

          return "recomendación";
        }

        // ---------------------------------------------------------------------
        // 15. PROTECCIÓN
        // ---------------------------------------------------------------------

        return fallar(
          "Prompt 5 devolvió una acción no reconocida",
          comparacion
        );
      },
      (resultado) => {
        registrarTiempo(
          sessionId,
          "TOTAL DEL MENSAJE",
          inicioMensaje,
          `mensaje ${numeroMensaje} del cliente → ${resultado}`
        );
      }
    );
  } catch (error) {
    console.error(
      "ERROR /api/advisor:",
      error
    );

    return respuestaError(
      error instanceof Error
        ? error.message
        : "Error interno del asesor"
    );
  } finally {
    if (sesionTiempos && !totalEnStream) {
      registrarTiempo(
        sesionTiempos,
        "TOTAL DEL MENSAJE",
        inicioMensaje,
        `mensaje ${numeroMensaje} del cliente → ${resultadoMensaje}`
      );
    }
  }
}