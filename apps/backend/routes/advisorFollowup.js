// apps/backend/routes/advisorFollowup.js

import { prompt6Repreguntas } from "../advisor/prompt/prompt6Repreguntas.js";
import {
  armarRegistroCliente,
  armarVerificaciones,
} from "./advisorRecommendation.js";

// -----------------------------------------------------------------------------
// CONFIGURACION
// -----------------------------------------------------------------------------

// Mismo modelo que el Prompt 5. Se puede cambiar desde el .env sin tocar código.
const MODELO_6B =
  process.env.ADVISOR_FOLLOWUP_MODEL || "gpt-6-luna";

// Cuántos mensajes recientes de la conversación ve el 6B.
// La recomendación completa ya le llega por separado.
const MENSAJES_HISTORIAL = 12;

const ACCIONES = [
  "responder",
  "recalcular",
  "rediagnosticar",
  "sin_evidencia",
];

// -----------------------------------------------------------------------------
// FORMATO DE RESPUESTA (structured output estricto)
// -----------------------------------------------------------------------------

const PROMPT6B_RESPONSE_FORMAT = {
  type: "json_schema",

  json_schema: {
    name: "advisor_followup",

    strict: true,

    schema: {
      type: "object",

      additionalProperties: false,

      required: [
        "accion",
        "mensaje_cliente",
        "equipo_consultado",
        "miss",
      ],

      properties: {
        accion: {
          type: "string",
          enum: ACCIONES,
        },

        mensaje_cliente: {
          type: "string",
        },

        equipo_consultado: {
          anyOf: [
            { type: "string" },
            { type: "null" },
          ],
        },

        miss: {
          anyOf: [
            { type: "null" },
            {
              type: "object",

              additionalProperties: false,

              required: ["query", "need"],

              properties: {
                query: { type: "string" },
                need: { type: "string" },
              },
            },
          ],
        },
      },
    },
  },
};

// -----------------------------------------------------------------------------
// VARIABLES DEL PROMPT 6B
// -----------------------------------------------------------------------------

/**
 * {{fichas_candidatos}}
 *
 * Una entrada por equipo candidato (sin repetir), con nombre, marca, tipo de
 * equipo y solo los valores documentados de su ficha (los null se omiten:
 * no aportan nada y agrandan mucho el prompt).
 */
function armarFichasCandidatos(candidatos) {
  const equipos = new Map();

  for (const etapa of candidatos || []) {
    for (const opcion of etapa?.opciones || []) {
      for (const equipo of opcion?.equipos || []) {
        const id = String(equipo?.id || "").trim();

        if (!id || equipos.has(id)) {
          continue;
        }

        const valores = Object.fromEntries(
          Object.entries(equipo?.ficha?.valores || {}).filter(
            ([, valor]) => valor !== null && valor !== undefined
          )
        );

        equipos.set(id, {
          id,
          nombre: equipo?.nombreComercial || id,
          marca: equipo?.marca || null,
          tipo_equipo: equipo?.tipoEquipo || null,
          etapa: etapa?.etapa || null,
          ficha: valores,
        });
      }
    }
  }

  return [...equipos.values()];
}

/**
 * {{historial}}: los últimos mensajes, en texto legible.
 */
function armarHistorial(historial) {
  return (historial || [])
    .slice(-MENSAJES_HISTORIAL)
    .map(
      (mensaje) =>
        `${mensaje?.rol === "cliente" ? "Cliente" : "Asesor"}: ${mensaje?.contenido ?? ""}`
    )
    .join("\n\n");
}

/** Último mensaje escrito por el cliente. */
function ultimoMensajeCliente(historial) {
  for (let i = (historial || []).length - 1; i >= 0; i--) {
    if (historial[i]?.rol === "cliente") {
      return String(historial[i]?.contenido || "");
    }
  }

  return "";
}

// -----------------------------------------------------------------------------
// RUTA
// -----------------------------------------------------------------------------
//
// Se llama en cada mensaje del cliente, antes del diagnóstico.
//
// - Si la sesión todavía no tiene una recomendación entregada, responde
//   "no_aplica" enseguida (sin llamar a la IA) y el mensaje sigue el flujo
//   normal: diagnóstico → comparación → recomendación.
//
// - Si ya la tiene, corre el Prompt 6B y devuelve la acción:
//   - "responder" / "sin_evidencia": el web muestra el mensaje y termina.
//   - "recalcular" / "rediagnosticar": la sesión vuelve a la fase de
//     diagnóstico y el web sigue el flujo normal. El Prompt 3 relee toda la
//     conversación, así que el dato nuevo queda en el registro y el Prompt 5
//     lo usa para la nueva comparación.
// -----------------------------------------------------------------------------

export function registerAdvisorFollowupRoutes(
  app,
  {
    openai,
    asyncHandler,
    cacheGet,
    cacheSet,
    reglasComunes,
    logMiss,
  }
) {
  app.post(
    "/advisor/followup",

    asyncHandler(async (req, res) => {
      const { sessionId, historial } = req.body || {};

      // -----------------------------------------------------------------------
      // VALIDACIONES
      // -----------------------------------------------------------------------

      if (!sessionId) {
        return res.status(400).json({
          ok: false,
          error: "Falta sessionId",
        });
      }

      if (!Array.isArray(historial)) {
        return res.status(400).json({
          ok: false,
          error: "Falta historial",
        });
      }

      // -----------------------------------------------------------------------
      // ¿YA SE ENTREGÓ UNA RECOMENDACIÓN?
      // -----------------------------------------------------------------------

      const sessionKey = `advisor:sesion:${sessionId}`;

      const sesion = await cacheGet(sessionKey);

      if (
        !sesion ||
        sesion.fase !== "recomendacion" ||
        !sesion.recomendacion
      ) {
        return res.json({
          ok: true,
          accion: "no_aplica",
        });
      }

      if (!openai) {
        return res.status(500).json({
          ok: false,
          error: "OpenAI no esta configurado",
        });
      }

      // -----------------------------------------------------------------------
      // VARIABLES DEL PROMPT
      // -----------------------------------------------------------------------

      const fichasCandidatos = armarFichasCandidatos(sesion.candidatos);

      const idsCandidatos = new Set(
        fichasCandidatos.map((equipo) => equipo.id)
      );

      const verificaciones = armarVerificaciones(sesion.comparacion);

      const prompt = prompt6Repreguntas({
        reglasComunes,

        registroCliente: JSON.stringify(
          armarRegistroCliente(
            sesion.registro,
            sesion.guia?.preguntas
          ),
          null,
          2
        ),

        seleccionDetallada: JSON.stringify(
          sesion.recomendacion.seleccionDetallada || [],
          null,
          2
        ),

        evaluacionOpciones: JSON.stringify(
          sesion.comparacion?.evaluacion_opciones || [],
          null,
          2
        ),

        verificacionesTecnicas:
          verificaciones.length > 0
            ? verificaciones.map((dato) => `- ${dato}`).join("\n")
            : "Ninguna",

        fichasCandidatos: JSON.stringify(
          fichasCandidatos,
          null,
          2
        ),

        historial: armarHistorial(historial),
      });

      // -----------------------------------------------------------------------
      // PROMPT 6B
      // -----------------------------------------------------------------------

      const inicio = Date.now();

      let respuesta;

      try {
        const completion = await openai.chat.completions.create({
          model: MODELO_6B,

          messages: [
            {
              role: "user",
              content: prompt,
            },
          ],

          response_format: PROMPT6B_RESPONSE_FORMAT,
        });

        const texto =
          completion.choices?.[0]?.message?.content?.trim();

        if (!texto) {
          throw new Error("Prompt 6B no devolvio contenido");
        }

        respuesta = JSON.parse(texto);
      } catch (error) {
        return res.status(500).json({
          ok: false,
          error: `Prompt 6B fallo: ${error.message}`,
        });
      }

      console.log(`PROMPT6B: ${Date.now() - inicio}ms`, {
        accion: respuesta?.accion,
        equipo: respuesta?.equipo_consultado,
      });

      // -----------------------------------------------------------------------
      // VALIDACION
      // -----------------------------------------------------------------------

      if (!ACCIONES.includes(respuesta?.accion)) {
        return res.status(500).json({
          ok: false,
          error: "Prompt 6B devolvio una accion invalida",
          respuesta,
        });
      }

      const mensajeCliente = String(
        respuesta?.mensaje_cliente || ""
      ).trim();

      if (!mensajeCliente) {
        return res.status(500).json({
          ok: false,
          error: "Prompt 6B no devolvio un mensaje para el cliente",
          respuesta,
        });
      }

      // Solo se acepta un equipo que exista entre los candidatos.
      const equipoConsultado =
        respuesta?.equipo_consultado &&
        idsCandidatos.has(String(respuesta.equipo_consultado))
          ? String(respuesta.equipo_consultado)
          : null;

      // -----------------------------------------------------------------------
      // SIN EVIDENCIA: REGISTRAR LA CONSULTA (como el @@MISS de los agentes)
      // -----------------------------------------------------------------------

      if (respuesta.accion === "sin_evidencia" && logMiss) {
        try {
          await logMiss({
            question:
              respuesta?.miss?.query ||
              ultimoMensajeCliente(historial),

            agentId:
              equipoConsultado || "asesor-integral",

            conversationId: sessionId,

            notes: respuesta?.miss?.need || "",

            context: "Asesor Integral - repregunta después de la recomendación",
          });
        } catch (error) {
          // El registro no debe cortar la respuesta al cliente.
          console.error("[advisor/followup] no se pudo registrar el miss", error?.message);
        }
      }

      // -----------------------------------------------------------------------
      // RECALCULAR / REDIAGNOSTICAR: VOLVER AL FLUJO NORMAL
      // -----------------------------------------------------------------------

      if (
        respuesta.accion === "recalcular" ||
        respuesta.accion === "rediagnosticar"
      ) {
        await cacheSet(
          sessionKey,
          {
            ...sesion,
            fase: "diagnostico",
            actualizadoEn: new Date().toISOString(),
          },
          0
        );
      }

      // -----------------------------------------------------------------------
      // RESPUESTA
      // -----------------------------------------------------------------------

      return res.json({
        ok: true,
        accion: respuesta.accion,
        mensajeCliente,
        equipoConsultado,
      });
    })
  );
}