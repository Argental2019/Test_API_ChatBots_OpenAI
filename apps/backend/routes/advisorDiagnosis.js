import { prompt3Diagnostico } from "../advisor/prompt/prompt3Diagnostico.js";
import { parsearGuiaPreguntas } from "../advisor/diagnostico/parsearGuiaPreguntas.js";
import { calcularObligatoriasPendientes } from "../advisor/diagnostico/calcularObligatoriasPendientes.js";
import { prompt4Diagnostico } from "../advisor/prompt/prompt4Diagnostico.js";
import { evaluarOpcionales } from "../advisor/diagnostico/evaluarOpcionales.js";

export function registerAdvisorDiagnosisRoutes(
  app,
  {
    openai,
    asyncHandler,
    cacheGet,
    cacheSet,
    getFileMeta,
    readFileSmart,
  }
) {
  app.get(
    "/advisor/diagnosis/guide",

    asyncHandler(async (req, res) => {
      const fileId =
        process.env.ADVISOR_GUIA_FILE_ID;

      if (!fileId) {
        return res.status(500).json({
          ok: false,
          error:
            "Falta configurar ADVISOR_GUIA_FILE_ID",
        });
      }

      const meta =
        await getFileMeta(fileId);

      const archivo =
        await readFileSmart({
          id: meta.id,
          name: meta.name,
          mimeType:
            meta.mimeType,
          etag:
            meta.etag,
        });

      if (
        !archivo?.content?.trim()
      ) {
        return res.status(500).json({
          ok: false,

          error:
            "La guía fue encontrada en Drive pero no se pudo extraer texto",

          archivo: {
            id:
              meta.id,

            nombre:
              meta.name,

            mimeType:
              meta.mimeType,

            version:
              meta.etag,
          },
        });
      }

      const preguntas =
        parsearGuiaPreguntas(
          archivo.content
        );

      return res.json({
        ok: true,

        archivo: {
          id:
            meta.id,

          nombre:
            meta.name,

          mimeType:
            meta.mimeType,

          version:
            meta.etag,

          fromCache:
            archivo.fromCache,
        },

        contenido:
          archivo.content,

        preguntas,
      });
    })
  );

  app.post(
    "/advisor/diagnosis/analyze",

    asyncHandler(
      async (
        req,
        res
      ) => {
        const {
          sessionId,
          productosValidos,
          etapasValidas,
          topeKgHarinaDia,
          registroActual,
          historial,
        } =
          req.body || {};

        // ---------------------------------------------------------------------
        // VALIDACIONES BÁSICAS
        // ---------------------------------------------------------------------

        if (!openai) {
          return res
            .status(500)
            .json({
              ok: false,

              error:
                "OpenAI no está configurado",
            });
        }

        if (!sessionId) {
          return res
            .status(400)
            .json({
              ok: false,

              error:
                "Falta sessionId",
            });
        }

        if (!productosValidos) {
          return res
            .status(400)
            .json({
              ok: false,

              error:
                "Falta productosValidos",
            });
        }

        if (!etapasValidas) {
          return res
            .status(400)
            .json({
              ok: false,

              error:
                "Falta etapasValidas",
            });
        }

        if (
          topeKgHarinaDia ===
            undefined ||
          topeKgHarinaDia ===
            null
        ) {
          return res
            .status(400)
            .json({
              ok: false,

              error:
                "Falta topeKgHarinaDia",
            });
        }

        if (!historial) {
          return res
            .status(400)
            .json({
              ok: false,

              error:
                "Falta historial",
            });
        }

        // ---------------------------------------------------------------------
        // SESIÓN
        // ---------------------------------------------------------------------

        const sessionKey =
          `advisor:sesion:${sessionId}`;

        const sesionGuardada =
          await cacheGet(
            sessionKey
          );

        // ---------------------------------------------------------------------
        // GUÍA DE PREGUNTAS
        // ---------------------------------------------------------------------

        let guiaSesion =
          sesionGuardada?.guia ||
          null;

        if (!guiaSesion) {
          const fileId =
            process.env
              .ADVISOR_GUIA_FILE_ID;

          if (!fileId) {
            return res
              .status(500)
              .json({
                ok: false,

                error:
                  "Falta configurar ADVISOR_GUIA_FILE_ID",
              });
          }

          const metaGuia =
            await getFileMeta(
              fileId
            );

          const archivoGuia =
            await readFileSmart({
              id:
                metaGuia.id,

              name:
                metaGuia.name,

              mimeType:
                metaGuia.mimeType,

              etag:
                metaGuia.etag,
            });

          if (
            !archivoGuia
              ?.content
              ?.trim()
          ) {
            return res
              .status(500)
              .json({
                ok: false,

                error:
                  "No se pudo extraer el contenido de la guía de preguntas",
              });
          }

          const preguntas =
            parsearGuiaPreguntas(
              archivoGuia.content
            );

          guiaSesion = {
            archivoId:
              metaGuia.id,

            nombre:
              metaGuia.name,

            version:
              metaGuia.etag,

            preguntas,
          };
        }

        const preguntasGuia =
          guiaSesion.preguntas;

        // ---------------------------------------------------------------------
        // REGISTRO INICIAL
        // ---------------------------------------------------------------------

        const registroVacio = {
          busqueda: {
            productos: [],

            productos_no_disponibles:
              [],

            etapas_cubiertas:
              [],

            congela:
              null,
            pregunta_productos:
              null,
          },

          respuestas:
            [],

          aclaraciones_pendientes:
            [],

          notas:
            [],

          fuera_de_alcance:
            null,
        };

        const registroInicial =
          registroActual ||
          sesionGuardada?.registro ||
          registroVacio;

        // ---------------------------------------------------------------------
        // EJECUTAR PROMPT 3
        // ---------------------------------------------------------------------

        async function ejecutarPrompt3(
          registroEntrada,
          respuestaAnterior = null
        ) {
          const promptBase =
            prompt3Diagnostico({
              preguntasGuia:
                JSON.stringify(
                  preguntasGuia,
                  null,
                  2
                ),

              productosValidos:
                typeof productosValidos ===
                "string"
                  ? productosValidos
                  : JSON.stringify(
                      productosValidos,
                      null,
                      2
                    ),

              etapasValidas:
                typeof etapasValidas ===
                "string"
                  ? etapasValidas
                  : JSON.stringify(
                      etapasValidas,
                      null,
                      2
                    ),

              topeKgHarinaDia,

              registroActual:
                typeof registroEntrada ===
                "string"
                  ? registroEntrada
                  : JSON.stringify(
                      registroEntrada,
                      null,
                      2
                    ),

              historial:
                typeof historial ===
                "string"
                  ? historial
                  : JSON.stringify(
                      historial,
                      null,
                      2
                    ),
            });

          // ---------------------------------------------------------------
          // PRIMER INTENTO
          // ---------------------------------------------------------------

          if (
            !respuestaAnterior
          ) {
            const completion =
              await openai
                .chat
                .completions
                .create({
                  model:
                    process.env
                      .ADVISOR_PREPARATION_MODEL ||
                    "gpt-5.1",

                  messages: [
                    {
                      role:
                        "user",

                      content:
                        promptBase,
                    },
                  ],

                  response_format: {
                    type:
                      "json_object",
                  },
                });

            const texto =
              completion
                .choices?.[0]
                ?.message
                ?.content;

            if (!texto) {
              throw new Error(
                "OpenAI no devolvió contenido en Prompt 3"
              );
            }

            try {
              return {
                registro:
                  JSON.parse(
                    texto
                  ),

                texto,
              };
            } catch {
              const error =
                new Error(
                  "Prompt 3 devolvió un JSON inválido"
                );

              error.raw =
                texto;

              throw error;
            }
          }

          // ---------------------------------------------------------------
          // REINTENTO DE REVISIÓN
          // ---------------------------------------------------------------

          const completion =
            await openai
              .chat
              .completions
              .create({
                model:
                  process.env
                    .ADVISOR_PREPARATION_MODEL ||
                  "gpt-5.1",

                messages: [
                  {
                    role:
                      "user",

                    content:
                      promptBase,
                  },

                  {
                    role:
                      "assistant",

                    content:
                      respuestaAnterior,
                  },

                  {
                    role:
                      "user",

                    content: `
Revisá tu respuesta anterior antes de responder nuevamente.

El código detectó una posible inconsistencia: modificaste información dentro de "busqueda", pero no agregaste ninguna respuesta nueva en "respuestas" ni ninguna aclaración nueva.

Volvé a revisar toda la CONVERSACIÓN y todas las PREGUNTAS DE LA GUÍA.

Recordá especialmente que "busqueda" y "respuestas" son independientes: si un dato explícito del cliente fue registrado en "busqueda" y ese mismo dato también responde una pregunta de la guía, debe aparecer además en "respuestas" con el número correcto de esa pregunta.

No inventes información y no agregues respuestas que el cliente no haya dado.

Conservá toda la información correcta del REGISTRO ACTUAL y corregí únicamente las omisiones o inconsistencias que encuentres.

Devolvé nuevamente el registro COMPLETO y únicamente como JSON.
                    `.trim(),
                  },
                ],

                response_format: {
                  type:
                    "json_object",
                },
              });

          const texto =
            completion
              .choices?.[0]
              ?.message
              ?.content;

          if (!texto) {
            throw new Error(
              "OpenAI no devolvió contenido en el reintento de Prompt 3"
            );
          }

          try {
            return {
              registro:
                JSON.parse(
                  texto
                ),

              texto,
            };
          } catch {
            const error =
              new Error(
                "El reintento de Prompt 3 devolvió un JSON inválido"
              );

            error.raw =
              texto;

            throw error;
          }
        }

        // ---------------------------------------------------------------------
        // NORMALIZACIÓN DEL REGISTRO INICIAL PARA COMPARAR
        // ---------------------------------------------------------------------

        let registroInicialObjeto =
          registroInicial;

        if (
          typeof registroInicialObjeto ===
          "string"
        ) {
          try {
            registroInicialObjeto =
              JSON.parse(
                registroInicialObjeto
              );
          } catch {
            registroInicialObjeto =
              registroVacio;
          }
        }

        // ---------------------------------------------------------------------
        // PRIMER INTENTO DE PROMPT 3
        // ---------------------------------------------------------------------

        let resultadoPrompt3;

        try {
          resultadoPrompt3 =
            await ejecutarPrompt3(
              registroInicial
            );
        } catch (error) {
          return res
            .status(500)
            .json({
              ok: false,

              error:
                error.message ||
                "Error ejecutando Prompt 3",

              ...(error.raw
                ? {
                    raw:
                      error.raw,
                  }
                : {}),
            });
        }

        let registro =
          resultadoPrompt3.registro;

        const respuestaPrimerIntentoPrompt3 =
          resultadoPrompt3.texto;

        // ---------------------------------------------------------------------
        // CONTROL DE CONSISTENCIA DE PROMPT 3
        // ---------------------------------------------------------------------

        /**
         * pregunta_productos sale de la guía, no de lo que dijo el cliente.
         * Lo excluimos de la comparación para que completarlo no se tome
         * como un dato nuevo del cliente sin respuesta registrada.
         */
        const busquedaComparable =
          (busqueda) => {
            const {
              pregunta_productos,
              ...resto
            } = busqueda ?? {};

            return JSON.stringify(
              resto
            );
          };

        const busquedaAntes =
          busquedaComparable(
            registroInicialObjeto
              ?.busqueda
          );

        const busquedaDespues =
          busquedaComparable(
            registro?.busqueda
          );
        const busquedaCambio =
          busquedaAntes !==
          busquedaDespues;

        const cantidadRespuestasAntes =
          Array.isArray(
            registroInicialObjeto
              ?.respuestas
          )
            ? registroInicialObjeto
                .respuestas
                .length
            : 0;

        const cantidadRespuestasDespues =
          Array.isArray(
            registro?.respuestas
          )
            ? registro
                .respuestas
                .length
            : 0;

        const agregoRespuesta =
          cantidadRespuestasDespues >
          cantidadRespuestasAntes;

        const cantidadAclaracionesAntes =
          Array.isArray(
            registroInicialObjeto
              ?.aclaraciones_pendientes
          )
            ? registroInicialObjeto
                .aclaraciones_pendientes
                .length
            : 0;

        const cantidadAclaracionesDespues =
          Array.isArray(
            registro
              ?.aclaraciones_pendientes
          )
            ? registro
                .aclaraciones_pendientes
                .length
            : 0;

        const agregoAclaracion =
          cantidadAclaracionesDespues >
          cantidadAclaracionesAntes;

        const necesitaReintentoPrompt3 =
          busquedaCambio &&
          !agregoRespuesta &&
          !agregoAclaracion;

        let reintentoPrompt3 =
          false;

        // ---------------------------------------------------------------------
        // SEGUNDO Y ÚNICO INTENTO DE PROMPT 3
        // ---------------------------------------------------------------------

        if (
          necesitaReintentoPrompt3
        ) {
          reintentoPrompt3 =
            true;

          console.warn(
            "[advisor][prompt3] Se detectó una posible inconsistencia. Ejecutando revisión."
          );

          try {
            const resultadoReintento =
              await ejecutarPrompt3(
                registroInicial,
                respuestaPrimerIntentoPrompt3
              );

            registro =
              resultadoReintento.registro;
          } catch (error) {
            return res
              .status(500)
              .json({
                ok: false,

                error:
                  error.message ||
                  "Error revisando Prompt 3",

                ...(error.raw
                  ? {
                      raw:
                        error.raw,
                    }
                  : {}),
              });
          }
        }
        // ---------------------------------------------------------------------
        // NORMALIZACIÓN DE pregunta_productos
        // ---------------------------------------------------------------------
        //
        // Prompt 3 indica qué pregunta de la guía pide los productos.
        // El código solo acepta un número que exista en la guía de la sesión.
        //
        // Si en este turno la IA no lo devolvió o devolvió un valor inválido,
        // se conserva el valor válido del registro anterior.
        //

        const numerosGuia =
          new Set(
            preguntasGuia.map(
              (pregunta) =>
                Number(
                  pregunta?.numero
                )
            )
          );

        const preguntaProductosValida =
          (valor) => {
            const numero =
              Number(valor);

            return valor !== null &&
              valor !== undefined &&
              valor !== "" &&
              numerosGuia.has(numero)
              ? numero
              : null;
          };

        if (
          registro?.busqueda
        ) {
          registro.busqueda.pregunta_productos =
            preguntaProductosValida(
              registro.busqueda
                .pregunta_productos
            ) ??
            preguntaProductosValida(
              registroInicialObjeto
                ?.busqueda
                ?.pregunta_productos
            );
        }
        // ---------------------------------------------------------------------
        // NORMALIZACIÓN DE fuera_de_alcance
        // ---------------------------------------------------------------------
        //
        // Prompt 3 debería devolver:
        //
        // - "volumen_excedido"
        // - "sin_productos_disponibles"
        // - null
        //
        // Si devuelve "null" como texto, lo convertimos a null real.
        //
        // Esto evita:
        //
        // Boolean("null") === true
        //
        // y por lo tanto evita que el diagnóstico quede abierto
        // cuando en realidad no existe ningún fuera de alcance.
        //

        if (
          registro
            .fuera_de_alcance ===
            "null" ||
          registro
            .fuera_de_alcance ===
            "" ||
          registro
            .fuera_de_alcance ===
            undefined
        ) {
          registro
            .fuera_de_alcance =
            null;
        }

        const valoresFueraDeAlcanceValidos =
          [
            "volumen_excedido",
            "sin_productos_disponibles",
            null,
          ];

        if (
          !valoresFueraDeAlcanceValidos.includes(
            registro
              .fuera_de_alcance
          )
        ) {
          return res
            .status(500)
            .json({
              ok: false,

              error:
                "Prompt 3 devolvió un valor inválido en fuera_de_alcance",

              valor:
                registro
                  .fuera_de_alcance,
            });
        }

        // ---------------------------------------------------------------------
        // CÁLCULO DE OBLIGATORIAS PENDIENTES
        // ---------------------------------------------------------------------

        const obligatoriasPendientes =
          calcularObligatoriasPendientes({
            preguntasGuia:
              guiaSesion
                .preguntas,

            registro,
          });

        // ---------------------------------------------------------------------
        // EVALUACIÓN FINAL DE PREGUNTAS OPCIONALES
        // ---------------------------------------------------------------------

        let evaluacionOpcionales =
          {
            hayOpcionalRelevante:
              false,

            pregunta:
              null,

            motivo:
              null,
          };

        const puedeEvaluarOpcionales =
          !registro
            .fuera_de_alcance &&
          registro
            .aclaraciones_pendientes
            .length === 0 &&
          obligatoriasPendientes
            .length === 0;

        if (
          puedeEvaluarOpcionales
        ) {
          try {
            evaluacionOpcionales =
              await evaluarOpcionales({
                openai,

                preguntasGuia:
                  guiaSesion
                    .preguntas,

                registro,

                historial,
              });
          } catch (error) {
            return res
              .status(500)
              .json({
                ok: false,

                error:
                  error.message ||
                  "Error evaluando preguntas opcionales",
              });
          }
        }

        // ---------------------------------------------------------------------
        // DEFINIR SI EL DIAGNÓSTICO CONTINÚA
        // ---------------------------------------------------------------------

        const diagnosticoSigue =
          Boolean(
            registro
              .fuera_de_alcance
          ) ||
          registro
            .aclaraciones_pendientes
            .length > 0 ||
          obligatoriasPendientes
            .length > 0 ||
          evaluacionOpcionales
            .hayOpcionalRelevante;

        let mensajeCliente =
          null;

        // ---------------------------------------------------------------------
        // PROMPT 4
        // ---------------------------------------------------------------------

        if (
          diagnosticoSigue
        ) {
          const prompt4 =
            prompt4Diagnostico({
              preguntasGuia:
                guiaSesion
                  .preguntas,

              productosValidos,

              registroActual:
                registro,

              aclaracionesPendientes:
                registro
                  .aclaraciones_pendientes,

              obligatoriasPendientes,

              fueraDeAlcance:
                registro
                  .fuera_de_alcance,

              historial,

              topeKgHarinaDia,

              opcionalRelevante:
                evaluacionOpcionales
                  .pregunta,
            });

          const completion4 =
            await openai
              .chat
              .completions
              .create({
                model:
                  process.env
                    .ADVISOR_PREPARATION_MODEL ||
                  "gpt-5.1",

                messages: [
                  {
                    role:
                      "user",

                    content:
                      prompt4,
                  },
                ],
              });

          mensajeCliente =
            completion4
              .choices?.[0]
              ?.message
              ?.content
              ?.trim() ||
            null;

          if (
            !mensajeCliente
          ) {
            return res
              .status(500)
              .json({
                ok: false,

                error:
                  "Prompt 4 no devolvió un mensaje para el cliente",
              });
          }
        }

        // ---------------------------------------------------------------------
        // GUARDAR SESIÓN
        // ---------------------------------------------------------------------

        await cacheSet(
          sessionKey,

          {
            sessionId,

            registro,

            guia:
              guiaSesion,

            actualizadoEn:
              new Date()
                .toISOString(),
          },

          0
        );

        // ---------------------------------------------------------------------
        // RESPUESTA
        // ---------------------------------------------------------------------

        return res.json({
          ok: true,

          sessionId,

          sesionExistente:
            Boolean(
              sesionGuardada
            ),

          guia: {
            version:
              guiaSesion
                .version,

            cantidadPreguntas:
              guiaSesion
                .preguntas
                .length,
          },

          reintentoPrompt3,

          diagnosticoSigue,

          obligatoriasPendientes,

          evaluacionOpcionales,

          mensajeCliente,

          registro,
        });
      }
    )
  );
}