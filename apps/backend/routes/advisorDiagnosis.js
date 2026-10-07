import { prompt3Diagnostico } from "../advisor/prompt/prompt3Diagnostico.js";
import { parsearGuiaPreguntas } from "../advisor/diagnostico/parsearGuiaPreguntas.js";
// Calcula qué preguntas obligatorias todavía faltan resolver
// a partir de la guía de la sesión y el registro actualizado.
import { calcularObligatoriasPendientes } from "../advisor/diagnostico/calcularObligatoriasPendientes.js";
// Prompt 4 conversa con el cliente durante el diagnóstico.
// Recibe el registro ya actualizado y las pendientes calculadas por código.
import { prompt4Diagnostico } from "../advisor/prompt/prompt4Diagnostico.js";
import { evaluarOpcionales } from "../advisor/diagnostico/evaluarOpcionales.js";

export function registerAdvisorDiagnosisRoutes(app, {
  openai,
  asyncHandler,

  // Funciones de cache ya existentes en el backend.
  // Si Redis está configurado, trabajan contra Redis.
  // Si no, usan el fallback en memoria que ya tiene el proyecto.
  cacheGet,
  cacheSet,

  // Funciones de Drive inyectadas desde index.js.
  // Las vamos a usar para leer la guía de preguntas.
  getFileMeta,
  readFileSmart,
}) {
  // -----------------------------------------------------------------------------
  // GET /advisor/diagnosis/guide
  // -----------------------------------------------------------------------------
  //
  // Endpoint de prueba para leer la guía de preguntas directamente desde Drive.
  //
  // Por ahora:
  // - localiza el archivo por su ID,
  // - obtiene su versión,
  // - extrae el texto,
  // - parsea las preguntas,
  // - devuelve el contenido.
  //
  app.get(
    "/advisor/diagnosis/guide",

    asyncHandler(async (req, res) => {
      // El ID del documento está configurado en el .env del backend.
      const fileId = process.env.ADVISOR_GUIA_FILE_ID;

      // Si falta la variable, detenemos la ejecución con un error claro.
      if (!fileId) {
        return res.status(500).json({
          ok: false,
          error: "Falta configurar ADVISOR_GUIA_FILE_ID",
        });
      }

      // Obtenemos la metadata actual del archivo desde Google Drive.
      // Esto nos permite conocer el nombre, tipo y versión actual.
      const meta = await getFileMeta(fileId);

      // Leemos el archivo reutilizando el mecanismo smart que ya existe.
      // Si esta misma versión ya fue procesada, puede recuperarla del cache.
      const archivo = await readFileSmart({
        id: meta.id,
        name: meta.name,
        mimeType: meta.mimeType,
        etag: meta.etag,
      });

      // Validamos que el extractor haya obtenido texto.
      if (!archivo?.content?.trim()) {
        return res.status(500).json({
          ok: false,
          error: "La guía fue encontrada en Drive pero no se pudo extraer texto",
          archivo: {
            id: meta.id,
            nombre: meta.name,
            mimeType: meta.mimeType,
            version: meta.etag,
          },
        });
      }

      // Transformamos el texto crudo del DOCX en la estructura
      // que posteriormente utilizarán Prompt 3 y Prompt 4.
      const preguntas = parsearGuiaPreguntas(archivo.content);

      return res.json({
        ok: true,

        archivo: {
          id: meta.id,
          nombre: meta.name,
          mimeType: meta.mimeType,
          version: meta.etag,
          fromCache: archivo.fromCache,
        },

        // Por ahora conservamos el contenido crudo porque estamos
        // probando el parser y nos sirve para comparar.
        contenido: archivo.content,

        // Esta es la representación que realmente utilizará Busquetti.
        preguntas,
      });
    })
  );


  // -----------------------------------------------------------------------------
  // POST /advisor/diagnosis/analyze
  // -----------------------------------------------------------------------------
  app.post(
    "/advisor/diagnosis/analyze",

    asyncHandler(async (req, res) => {
      const {
        // Identificador único de la conversación.
        // Nos permite guardar y recuperar el diagnóstico desde Redis.
        sessionId,

        productosValidos,
        etapasValidas,
        topeKgHarinaDia,

        // Lo mantenemos temporalmente para poder seguir haciendo
        // pruebas manuales enviando un registro específico.
        registroActual,

        historial,
      } = req.body || {};


      // ---------------------------------------------------------------------------
      // VALIDACIONES BÁSICAS
      // ---------------------------------------------------------------------------

      if (!openai) {
        return res.status(500).json({
          ok: false,
          error: "OpenAI no está configurado",
        });
      }

      // Cada diagnóstico necesita identificar a qué conversación pertenece.
      if (!sessionId) {
        return res.status(400).json({
          ok: false,
          error: "Falta sessionId",
        });
      }

      if (!productosValidos) {
        return res.status(400).json({
          ok: false,
          error: "Falta productosValidos",
        });
      }

      if (!etapasValidas) {
        return res.status(400).json({
          ok: false,
          error: "Falta etapasValidas",
        });
      }

      if (topeKgHarinaDia === undefined || topeKgHarinaDia === null) {
        return res.status(400).json({
          ok: false,
          error: "Falta topeKgHarinaDia",
        });
      }

      if (!historial) {
        return res.status(400).json({
          ok: false,
          error: "Falta historial",
        });
      }


      // ---------------------------------------------------------------------------
      // SESIÓN
      // ---------------------------------------------------------------------------

      // Cada conversación se guarda bajo una clave independiente.
      const sessionKey = `advisor:sesion:${sessionId}`;

      // Intentamos recuperar el diagnóstico que ya tenía esta conversación.
      const sesionGuardada = await cacheGet(sessionKey);


      // ---------------------------------------------------------------------------
      // GUÍA DE PREGUNTAS DE LA SESIÓN
      // ---------------------------------------------------------------------------
      //
      // Cada conversación conserva la versión de la guía con la que comenzó.
      //
      // Si la sesión ya tiene una guía guardada:
      // → reutilizamos exactamente esa.
      //
      // Si la sesión es nueva:
      // → leemos la versión actual desde Drive,
      // → la parseamos,
      // → y luego la guardamos junto con la sesión.
      //
      // De esta manera, si alguien modifica el DOCX mientras el cliente está
      // conversando, la numeración y las preguntas de esa conversación no cambian.
      //
      let guiaSesion = sesionGuardada?.guia || null;

      if (!guiaSesion) {
        const fileId = process.env.ADVISOR_GUIA_FILE_ID;

        if (!fileId) {
          return res.status(500).json({
            ok: false,
            error: "Falta configurar ADVISOR_GUIA_FILE_ID",
          });
        }

        // Obtenemos la versión actual del archivo de Drive.
        const metaGuia = await getFileMeta(fileId);

        // Leemos el contenido usando el mismo sistema de cache
        // que ya validamos anteriormente.
        const archivoGuia = await readFileSmart({
          id: metaGuia.id,
          name: metaGuia.name,
          mimeType: metaGuia.mimeType,
          etag: metaGuia.etag,
        });

        if (!archivoGuia?.content?.trim()) {
          return res.status(500).json({
            ok: false,
            error: "No se pudo extraer el contenido de la guía de preguntas",
          });
        }

        // Convertimos el documento en la estructura que usan
        // Prompt 3 y posteriormente Prompt 4.
        const preguntas = parsearGuiaPreguntas(archivoGuia.content);

        // Esta es la copia fija que va a pertenecer a esta conversación.
        guiaSesion = {
          archivoId: metaGuia.id,
          nombre: metaGuia.name,
          version: metaGuia.etag,
          preguntas,
        };
      }

      // Desde este punto del flujo, Prompt 3 usa SIEMPRE
      // las preguntas guardadas en la sesión.
      const preguntasGuia = guiaSesion.preguntas;


      // ---------------------------------------------------------------------------
      // REGISTRO INICIAL
      // ---------------------------------------------------------------------------

      // Registro vacío que usamos solamente cuando la conversación
      // todavía no tiene ningún estado guardado.
      const registroVacio = {
        busqueda: {
          productos: [],
          productos_no_disponibles: [],
          etapas_cubiertas: [],
          congela: null,
        },

        respuestas: [],
        aclaraciones_pendientes: [],
        notas: [],
        fuera_de_alcance: null,
      };


      // Prioridad durante esta etapa de pruebas:
      //
      // 1. Si Postman envía registroActual, usamos ese.
      // 2. Si no, usamos el registro recuperado de Redis.
      // 3. Si tampoco existe, empezamos con el registro vacío.
      //
      // Más adelante, cuando conectemos el flujo definitivo,
      // podemos eliminar registroActual del request y dejar Redis
      // como única fuente del estado de la conversación.
      const registroInicial =
        registroActual ||
        sesionGuardada?.registro ||
        registroVacio;


      // ---------------------------------------------------------------------------
      // EJECUCIÓN DE PROMPT 3
      // ---------------------------------------------------------------------------
      //
      // Esta función sirve tanto para:
      //
      // - el primer intento normal;
      // - el único reintento de revisión.
      //
      // Sigue siendo exactamente Prompt 3.
      // No estamos creando otro agente ni otra etapa del flujo.
      //
      async function ejecutarPrompt3(
        registroEntrada,
        respuestaAnterior = null
      ) {
        const promptBase = prompt3Diagnostico({
          // Prompt 3 recibe siempre la guía numerada
          // que quedó fijada para esta sesión.
          preguntasGuia: JSON.stringify(
            preguntasGuia,
            null,
            2
          ),

          productosValidos:
            typeof productosValidos === "string"
              ? productosValidos
              : JSON.stringify(
                  productosValidos,
                  null,
                  2
                ),

          etapasValidas:
            typeof etapasValidas === "string"
              ? etapasValidas
              : JSON.stringify(
                  etapasValidas,
                  null,
                  2
                ),

          topeKgHarinaDia,

          // IMPORTANTE:
          //
          // Tanto el primer intento como el reintento
          // parten del registro que se pasa acá.
          //
          // En el reintento vamos a volver a pasar
          // el registro ORIGINAL.
          registroActual:
            typeof registroEntrada === "string"
              ? registroEntrada
              : JSON.stringify(
                  registroEntrada,
                  null,
                  2
                ),

          historial:
            typeof historial === "string"
              ? historial
              : JSON.stringify(
                  historial,
                  null,
                  2
                ),
        });


        // -------------------------------------------------------------------------
        // PRIMER INTENTO
        // -------------------------------------------------------------------------
        //
        // Si no recibimos una respuesta anterior,
        // ejecutamos Prompt 3 normalmente.
        //
        if (!respuestaAnterior) {
          const completion =
            await openai.chat.completions.create({
              model:
                process.env.ADVISOR_PREPARATION_MODEL ||
                "gpt-5.1",

              messages: [
                {
                  role: "user",
                  content: promptBase,
                },
              ],

              // Prompt 3 debe devolver JSON.
              response_format: {
                type: "json_object",
              },
            });


          const texto =
            completion.choices?.[0]?.message?.content;


          if (!texto) {
            throw new Error(
              "OpenAI no devolvió contenido en Prompt 3"
            );
          }


          try {
            return {
              registro: JSON.parse(texto),

              // Guardamos también el texto original.
              //
              // Si luego detectamos una inconsistencia,
              // se lo vamos a mostrar al modelo en el reintento.
              texto,
            };
          } catch {
            const error = new Error(
              "Prompt 3 devolvió un JSON inválido"
            );

            error.raw = texto;

            throw error;
          }
        }


        // -------------------------------------------------------------------------
        // REINTENTO DE REVISIÓN
        // -------------------------------------------------------------------------
        //
        // Si llegamos acá significa que:
        //
        // - el código detectó una posible inconsistencia;
        // - tenemos la respuesta del primer intento;
        // - vamos a pedirle a Prompt 3 que revise esa respuesta.
        //
        // IMPORTANTE:
        //
        // El REGISTRO ACTUAL sigue siendo el ORIGINAL.
        //
        // La respuesta defectuosa del primer intento se pasa
        // aparte como un mensaje del assistant.
        //
        const completion =
          await openai.chat.completions.create({
            model:
              process.env.ADVISOR_PREPARATION_MODEL ||
              "gpt-5.1",

            messages: [
              {
                // Prompt 3 completo, nuevamente.
                role: "user",
                content: promptBase,
              },

              {
                // Le mostramos exactamente qué había respondido
                // en el primer intento.
                role: "assistant",
                content: respuestaAnterior,
              },

              {
                // Le indicamos únicamente qué inconsistencia
                // detectó el código.
                //
                // NO hardcodeamos:
                // - número de pregunta,
                // - producto,
                // - respuesta esperada.
                role: "user",
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
              type: "json_object",
            },
          });


        const texto =
          completion.choices?.[0]?.message?.content;


        if (!texto) {
          throw new Error(
            "OpenAI no devolvió contenido en el reintento de Prompt 3"
          );
        }


        try {
          return {
            registro: JSON.parse(texto),
            texto,
          };
        } catch {
          const error = new Error(
            "El reintento de Prompt 3 devolvió un JSON inválido"
          );

          error.raw = texto;

          throw error;
        }
      }


      // ---------------------------------------------------------------------------
      // NORMALIZACIÓN DEL REGISTRO INICIAL PARA LA COMPARACIÓN
      // ---------------------------------------------------------------------------
      //
      // Normalmente registroInicial ya es un objeto.
      //
      // Pero durante las pruebas todavía permitimos
      // mandar registroActual manualmente desde Postman.
      //
      // Si viniera como string, intentamos convertirlo.
      //
      let registroInicialObjeto =
        registroInicial;


      if (
        typeof registroInicialObjeto === "string"
      ) {
        try {
          registroInicialObjeto =
            JSON.parse(
              registroInicialObjeto
            );
        } catch {
          // Esto se utiliza solamente para comparar
          // el antes y el después de Prompt 3.
          //
          // No modifica el valor real que recibe Prompt 3.
          registroInicialObjeto =
            registroVacio;
        }
      }


      // ---------------------------------------------------------------------------
      // PRIMER INTENTO DE PROMPT 3
      // ---------------------------------------------------------------------------

      let resultadoPrompt3;


      try {
        resultadoPrompt3 =
          await ejecutarPrompt3(
            registroInicial
          );
      } catch (error) {
        return res.status(500).json({
          ok: false,

          error:
            error.message ||
            "Error ejecutando Prompt 3",

          ...(error.raw
            ? { raw: error.raw }
            : {}),
        });
      }


      // Registro producido por Prompt 3.
      let registro =
        resultadoPrompt3.registro;


      // Guardamos el texto exacto que devolvió Prompt 3.
      //
      // Si detectamos una inconsistencia,
      // esta respuesta se utiliza para la revisión.
      const respuestaPrimerIntentoPrompt3 =
        resultadoPrompt3.texto;


      // ---------------------------------------------------------------------------
      // VALIDACIÓN DE CONSISTENCIA
      // ---------------------------------------------------------------------------
      //
      // No hardcodeamos:
      //
      // - qué número tiene la pregunta de productos;
      // - qué pregunta corresponde a congela;
      // - qué respuesta tendría que existir;
      // - qué producto se mencionó.
      //
      // Solamente detectamos esta situación:
      //
      // 1. Prompt 3 cambió información dentro de "busqueda".
      // 2. No agregó ninguna nueva respuesta.
      // 3. No agregó ninguna nueva aclaración.
      //
      // En ese caso consideramos que existe una posible
      // omisión y hacemos UN único reintento.
      // ---------------------------------------------------------------------------


      // ---------------------------------------------------------------------------
      // ¿CAMBIÓ BUSQUEDA?
      // ---------------------------------------------------------------------------

      const busquedaAntes =
        JSON.stringify(
          registroInicialObjeto?.busqueda ??
            {}
        );


      const busquedaDespues =
        JSON.stringify(
          registro?.busqueda ??
            {}
        );


      const busquedaCambio =
        busquedaAntes !==
        busquedaDespues;


      // ---------------------------------------------------------------------------
      // ¿AGREGÓ UNA RESPUESTA?
      // ---------------------------------------------------------------------------

      const cantidadRespuestasAntes =
        Array.isArray(
          registroInicialObjeto?.respuestas
        )
          ? registroInicialObjeto
              .respuestas.length
          : 0;


      const cantidadRespuestasDespues =
        Array.isArray(
          registro?.respuestas
        )
          ? registro.respuestas.length
          : 0;


      const agregoRespuesta =
        cantidadRespuestasDespues >
        cantidadRespuestasAntes;


      // ---------------------------------------------------------------------------
      // ¿AGREGÓ UNA ACLARACIÓN?
      // ---------------------------------------------------------------------------

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


      // ---------------------------------------------------------------------------
      // ¿NECESITA REINTENTO?
      // ---------------------------------------------------------------------------
      //
      // Si la búsqueda cambió pero Prompt 3 no agregó
      // ni una respuesta ni una aclaración,
      // consideramos que el resultado es sospechoso.
      //
      // Si generó una aclaración, no reintentamos.
      //
      // Puede ser perfectamente correcto que todavía
      // no exista una respuesta confirmada.
      //
      const necesitaReintentoPrompt3 =
        busquedaCambio &&
        !agregoRespuesta &&
        !agregoAclaracion;


      // Bandera temporal para nuestras pruebas de Postman.
      //
      // Más adelante la podemos sacar del response.
      let reintentoPrompt3 = false;


      // ---------------------------------------------------------------------------
      // SEGUNDO Y ÚNICO INTENTO DE PROMPT 3
      // ---------------------------------------------------------------------------

      if (necesitaReintentoPrompt3) {
        reintentoPrompt3 = true;


        console.warn(
          "[advisor][prompt3] Se detectó una posible inconsistencia. Ejecutando revisión."
        );


        try {
          const resultadoReintento =
            await ejecutarPrompt3(
              // IMPORTANTE:
              //
              // El segundo intento vuelve a partir
              // del registro ORIGINAL.
              registroInicial,

              // Aparte le mostramos la respuesta
              // defectuosa del primer intento.
              respuestaPrimerIntentoPrompt3
            );


          // El resultado de la revisión reemplaza
          // al resultado del primer intento.
          registro =
            resultadoReintento.registro;
        } catch (error) {
          return res.status(500).json({
            ok: false,

            error:
              error.message ||
              "Error revisando Prompt 3",

            ...(error.raw
              ? { raw: error.raw }
              : {}),
          });
        }
      }


      // ---------------------------------------------------------------------------
      // CÁLCULO DE OBLIGATORIAS PENDIENTES
      // ---------------------------------------------------------------------------
      //
      // IMPORTANTE:
      //
      // Esto ocurre DESPUÉS del posible reintento.
      //
      // Por lo tanto usamos siempre el registro FINAL
      // producido por Prompt 3.
      //
      // No se guarda en Redis porque puede recalcularse
      // usando la guía y el registro actual.
      //
      const obligatoriasPendientes =
        calcularObligatoriasPendientes({
          preguntasGuia:
            guiaSesion.preguntas,

          registro,
        });
// ---------------------------------------------------------------------------
// EVALUACIÓN FINAL DE PREGUNTAS OPCIONALES
// ---------------------------------------------------------------------------
//
// Durante el diagnóstico normal Prompt 4 ya puede decidir hacer una
// opcional cuando lo que acaba de decir el cliente la vuelve relevante.
//
// Este bloque cumple otra función:
//
// cuando ya NO quedan:
// - aclaraciones,
// - obligatorias,
// - ni un caso de fuera de alcance,
//
// hacemos una última revisión de las preguntas opcionales antes de
// declarar terminado el diagnóstico.
//
// Así evitamos cerrar el diagnóstico demasiado pronto.
let evaluacionOpcionales = {
  hayOpcionalRelevante: false,
  pregunta: null,
  motivo: null,
};


// Solo evaluamos opcionales cuando todo lo obligatorio
// y todas las aclaraciones ya fueron resueltas.
const puedeEvaluarOpcionales =
  !registro.fuera_de_alcance &&
  registro.aclaraciones_pendientes.length === 0 &&
  obligatoriasPendientes.length === 0;


if (puedeEvaluarOpcionales) {
  try {
    evaluacionOpcionales =
      await evaluarOpcionales({
        openai,

        // Usamos la guía congelada de esta conversación.
        preguntasGuia:
          guiaSesion.preguntas,

        // Registro completo ya actualizado por Prompt 3.
        registro,

        // Historial del mensaje actual.
        historial,
      });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      error:
        error.message ||
        "Error evaluando preguntas opcionales",
    });
  }
}

      // ---------------------------------------------------------------------------
      // PROMPT 4 - SIGUIENTE MENSAJE DEL DIAGNÓSTICO
      // ---------------------------------------------------------------------------
      //
      // Prompt 4 se ejecuta mientras el diagnóstico
      // todavía tenga algo que resolver.
      //
      // Por ahora contemplamos:
      //
      // - una consulta fuera de alcance;
      // - aclaraciones pendientes;
      // - preguntas obligatorias pendientes.
      //
      // Las preguntas opcionales NO las calcula el código.
      //
      // Prompt 4 decide si alguna es relevante según
      // el contexto de la conversación.
      //
// El diagnóstico continúa si:
//
// - hay algo fuera de alcance que resolver,
// - queda una aclaración,
// - queda una obligatoria,
// - o la evaluación final encontró una opcional relevante.
const diagnosticoSigue =
  Boolean(
    registro.fuera_de_alcance
  ) ||
  registro
    .aclaraciones_pendientes
    .length > 0 ||
  obligatoriasPendientes.length > 0 ||
  evaluacionOpcionales.hayOpcionalRelevante;


      let mensajeCliente = null;


      if (diagnosticoSigue) {
        // Armamos Prompt 4 con la información
        // que ya produjo el flujo.
        const prompt4 =
          prompt4Diagnostico({
            preguntasGuia:
              guiaSesion.preguntas,

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
            // Si la evaluación final eligió una opcional,
            // se la pasamos explícitamente a Prompt 4.
            //
            // Normalmente será null mientras todavía
            // haya obligatorias pendientes.
            opcionalRelevante:
            evaluacionOpcionales.pregunta,
          });


        // Ejecutamos Prompt 4.
        //
        // Para esta prueba lo hacemos sin streaming.
        //
        // Cuando llevemos el flujo al endpoint final,
        // ahí recuperamos el streaming hacia el front.
        const completion4 =
          await openai.chat.completions.create({
            model:
              process.env
                .ADVISOR_PREPARATION_MODEL ||
              "gpt-5.1",

            messages: [
              {
                role: "user",
                content: prompt4,
              },
            ],
          });


        // Prompt 4 no devuelve JSON.
        //
        // Devuelve directamente el mensaje
        // que verá el cliente.
        mensajeCliente =
          completion4
            .choices?.[0]
            ?.message?.content
            ?.trim() ||
          null;


        if (!mensajeCliente) {
          return res.status(500).json({
            ok: false,

            error:
              "Prompt 4 no devolvió un mensaje para el cliente",
          });
        }
      }


      // ---------------------------------------------------------------------------
      // GUARDADO DE LA SESIÓN
      // ---------------------------------------------------------------------------
      //
      // Guardamos el estado completo actualizado
      // de la conversación.
      //
      // TTL = 0 significa persistente usando
      // el cacheSet que ya modificamos.
      //
      await cacheSet(
        sessionKey,

        {
          sessionId,

          // Guardamos el diagnóstico FINAL.
          //
          // Si hubo reintento,
          // este es el resultado corregido.
          registro,

          // Guardamos también la copia de la guía
          // utilizada por esta conversación.
          //
          // En las llamadas siguientes no importa
          // si el DOCX de Drive cambió:
          // esta sesión mantiene su propia versión.
          guia: guiaSesion,

          actualizadoEn:
            new Date().toISOString(),
        },

        0
      );


      // ---------------------------------------------------------------------------
      // RESPONSE TEMPORAL DE PRUEBA
      // ---------------------------------------------------------------------------

      return res.json({
        ok: true,

        sessionId,

        sesionExistente:
          Boolean(sesionGuardada),

        guia: {
          version:
            guiaSesion.version,

          cantidadPreguntas:
            guiaSesion.preguntas.length,
        },

        // Temporal:
        //
        // true = el primer resultado de Prompt 3
        // parecía inconsistente y se ejecutó
        // una revisión.
        //
        // false = Prompt 3 pasó la validación
        // en el primer intento.
        reintentoPrompt3,

        // Nos permite ver si el código considera
        // que todavía estamos en diagnóstico.
        diagnosticoSigue,

        obligatoriasPendientes,

          // Temporal para nuestras pruebas.
        evaluacionOpcionales,

        // Mensaje generado por Prompt 4.
        //
        // Será null cuando el diagnóstico
        // esté terminado.
        mensajeCliente,

        registro,
      });
    })
  );
}