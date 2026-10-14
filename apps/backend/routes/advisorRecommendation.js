// apps/backend/routes/advisorRecommendation.js

import { prompt6Recomendacion } from "../advisor/prompt/prompt6Recomendacion.js";

// -----------------------------------------------------------------------------
// UTILIDADES
// -----------------------------------------------------------------------------

/**
 * Prompt 5 puede devolver un motivo como texto, como null
 * o como objeto (motivo_detallado). Para el 6A solo necesitamos el texto.
 */
function textoMotivo(motivo) {
  if (motivo === null || motivo === undefined) {
    return null;
  }

  if (typeof motivo === "string") {
    return motivo.trim() || null;
  }

  if (typeof motivo === "object") {
    return motivo.explicacion?.trim() || null;
  }

  return null;
}

/**
 * Dos opciones son la misma si tienen exactamente los mismos IDs,
 * sin importar el orden (importa para los conjuntos).
 */
function mismaOpcion(idsA, idsB) {
  const a = [...(idsA || [])].map(String).sort();
  const b = [...(idsB || [])].map(String).sort();

  return (
    a.length === b.length &&
    a.every((id, indice) => id === b[indice])
  );
}

/**
 * Índice de los equipos candidatos: id -> nombre comercial, marca y tipo de equipo.
 * Los candidatos vienen del Excel (armarCandidatos), así que el nombre
 * que ve el cliente sale de ahí y no de la IA.
 */
function indexarEquiposCandidatos(candidatos) {
  const mapa = new Map();

  for (const etapa of candidatos || []) {
    for (const opcion of etapa?.opciones || []) {
      for (const equipo of opcion?.equipos || []) {
        const id = String(
          equipo?.id || equipo?.idBusquetti || ""
        ).trim();

        if (!id || mapa.has(id)) {
          continue;
        }

        mapa.set(id, {
          nombre:
            equipo?.nombreComercial ||
            equipo?.nombre ||
            id,

          marca:
            equipo?.marca ||
            null,

          tipo:
            equipo?.tipoEquipo ||
            null,
        });
      }
    }
  }

  return mapa;
}

/**
 * IDs que el cliente va a ver: recomendados y alternativas a confirmar.
 * Los descartes no cuentan.
 */
function idsVisibles(comparacion) {
  const recomendados = new Set();
  const alternativas = new Set();

  for (const etapa of comparacion?.seleccion || []) {
    for (const item of etapa?.recomendados || []) {
      for (const id of item?.ids || []) {
        // En una etapa sin volumen no se elige tamaño:
        // sus opciones se muestran como alternativas.
        if (etapa?.sin_volumen) {
          alternativas.add(String(id));
        } else {
          recomendados.add(String(id));
        }
      }
    }

    for (const item of etapa?.alternativas_a_confirmar || []) {
      for (const id of item?.ids || []) {
        alternativas.add(String(id));
      }
    }
  }

  return {
    recomendados,
    alternativas,
  };
}

// -----------------------------------------------------------------------------
// VARIABLES DEL PROMPT 6A
// -----------------------------------------------------------------------------

/**
 * {{registro_cliente}}
 *
 * Las respuestas del registro solo tienen el número de pregunta.
 * Le agregamos la pregunta de la guía guardada en la sesión para que
 * la IA sepa qué significa cada respuesta.
 */
export function armarRegistroCliente(registro, preguntasGuia) {
  const preguntaPorNumero = new Map(
    (preguntasGuia || []).map((pregunta) => [
      Number(pregunta?.numero),
      pregunta,
    ])
  );

  return {
    busqueda:
      registro?.busqueda || {},

    respuestas: (registro?.respuestas || []).map(
      (respuesta) => ({
        pregunta:
          preguntaPorNumero.get(
            Number(respuesta?.pregunta)
          ) || respuesta?.pregunta,

        respuesta:
          respuesta?.respuesta ?? null,

        producto:
          respuesta?.producto ?? null,

        estado:
          respuesta?.estado ?? null,
      })
    ),

    notas:
      registro?.notas || [],
  };
}

/**
 * {{seleccion_detallada}}
 *
 * Toma la selección del Prompt 5 y la completa con:
 * - nombre comercial, marca y tipo de equipo (del Excel),
 * - capacidad diaria y su cálculo (de evaluacion_equipos),
 * - motivo de cada opción (de evaluacion_opciones o del descarte).
 *
 * No cambia la selección: solo agrega datos para que la IA no tenga
 * que buscarlos en todo el JSON de la comparación.
 */
function armarSeleccionDetallada(comparacion, equiposCandidatos) {
  const evaluacionEquipos =
    comparacion?.evaluacion_equipos || [];

  const evaluacionOpciones =
    comparacion?.evaluacion_opciones || [];

  const evaluacionDeEquipo = (id, etapa) =>
    evaluacionEquipos.find(
      (equipo) =>
        String(equipo?.id) === id &&
        equipo?.etapa === etapa
    ) || null;

  const detallarOpcion = (
    item,
    etapa,
    motivoPropio = null
  ) => {
    const ids = (item?.ids || []).map(String);

    const evaluacion = evaluacionOpciones.find(
      (opcion) =>
        opcion?.etapa === etapa &&
        mismaOpcion(opcion?.ids, ids)
    );

    return {
      tipo:
        evaluacion?.tipo ||
        (ids.length > 1 ? "conjunto" : "individual"),

      marca:
        item?.marca ||
        evaluacion?.marca ||
        null,

      capacidad_diaria_opcion:
        evaluacion?.capacidad_diaria?.valor ?? null,

      motivo:
        textoMotivo(motivoPropio) ??
        textoMotivo(evaluacion?.motivo),

      equipos: ids.map((id) => {
        const candidato =
          equiposCandidatos.get(id);

        const evaluacionEquipo =
          evaluacionDeEquipo(id, etapa);

        return {
          id,

          nombre:
            candidato?.nombre || id,

          marca:
            candidato?.marca ||
            item?.marca ||
            null,

          // Qué es el equipo (columna "Tipo de equipo" del Excel), para que
          // la IA no tenga que adivinarlo a partir del nombre comercial.
          tipo_equipo:
            candidato?.tipo || null,

          capacidad_diaria:
            evaluacionEquipo?.capacidad_diaria?.valor ?? null,

          calculo_capacidad:
            evaluacionEquipo?.capacidad_diaria?.calculo ?? null,
        };
      }),
    };
  };

  return (comparacion?.seleccion || []).map((etapa) => {
    const nombreEtapa = etapa?.etapa;

    const volumen =
      evaluacionEquipos.find(
        (equipo) =>
          equipo?.etapa === nombreEtapa &&
          equipo?.volumen_a_cubrir?.valor !== null &&
          equipo?.volumen_a_cubrir?.valor !== undefined
      )?.volumen_a_cubrir?.valor ?? null;

    const sinVolumen = Boolean(etapa?.sin_volumen);
    const sinOpciones = Boolean(etapa?.sin_opciones);

    return {
      etapa:
        nombreEtapa,

      volumen_a_cubrir_kg_harina_dia:
        volumen,

      sin_volumen:
        sinVolumen,

      sin_opciones:
        sinOpciones,

      // El motivo de la etapa suele ser razonamiento interno del Prompt 5
      // (por ejemplo, cómo desempató). Solo se pasa cuando el 6A lo
      // necesita para explicarle algo al cliente.
      motivo_etapa:
        sinVolumen || sinOpciones
          ? textoMotivo(etapa?.motivo)
          : null,

      recomendados: (etapa?.recomendados || []).map(
        (item) => detallarOpcion(item, nombreEtapa)
      ),

      alternativas_a_confirmar: (
        etapa?.alternativas_a_confirmar || []
      ).map(
        (item) => detallarOpcion(item, nombreEtapa)
      ),

      descartes_a_explicar: (
        etapa?.descartes_a_explicar || []
      ).map(
        (item) =>
          detallarOpcion(item, nombreEtapa, item?.motivo)
      ),
    };
  });
}

/**
 * {{verificaciones_tecnicas}}
 *
 * - Solo de equipos que el cliente va a ver (recomendados y alternativas).
 *   Un equipo descartado o no elegido no debe generarle verificaciones.
 * - Sin repetir el mismo dato aunque aplique a varios equipos.
 */
export function armarVerificaciones(comparacion) {
  const { recomendados, alternativas } =
    idsVisibles(comparacion);

  const datos = new Map();

  for (
    const verificacion of
    comparacion?.verificaciones_tecnicas || []
  ) {
    const equipo = String(verificacion?.equipo || "");

    if (
      !recomendados.has(equipo) &&
      !alternativas.has(equipo)
    ) {
      continue;
    }

    const dato = String(verificacion?.dato || "")
      .trim()
      .replace(/\.$/, "");

    if (!dato) {
      continue;
    }

    const clave = dato.toLowerCase();

    if (!datos.has(clave)) {
      datos.set(clave, dato);
    }
  }

  return [...datos.values()];
}

// -----------------------------------------------------------------------------
// VALIDAR TAGS
// -----------------------------------------------------------------------------
//
// La IA escribe [RECOMENDAR:ID] y [ALTERNATIVA:ID] al final del texto.
// El código solo deja los que coinciden con la selección del Prompt 5:
// - RECOMENDAR: IDs recomendados.
// - ALTERNATIVA: IDs a confirmar o de etapas sin volumen.
// Cualquier otro tag se elimina del texto.
// -----------------------------------------------------------------------------

function validarTags(texto, comparacion) {
  const { recomendados, alternativas } =
    idsVisibles(comparacion);

  const tags = {
    recomendar: [],
    alternativa: [],
    descartados: [],
  };

  const limpio = texto.replace(
    /\[(RECOMENDAR|ALTERNATIVA):\s*([^\]]+?)\s*\]/g,
    (completo, tipo, id) => {
      const permitido =
        tipo === "RECOMENDAR"
          ? recomendados.has(id)
          : alternativas.has(id);

      if (!permitido) {
        tags.descartados.push(completo);
        return "";
      }

      const lista =
        tipo === "RECOMENDAR"
          ? tags.recomendar
          : tags.alternativa;

      if (!lista.includes(id)) {
        lista.push(id);
      }

      return completo;
    }
  );

  return {
    texto: limpio
      .replace(/[ \t]+\n/g, "\n")
      .trim(),

    tags,
  };
}

// -----------------------------------------------------------------------------
// RUTA
// -----------------------------------------------------------------------------

export function registerAdvisorRecommendationRoutes(
  app,
  {
    openai,
    asyncHandler,
    cacheGet,
    cacheSet,
    reglasComunes,
  }
) {
  app.post(
    "/advisor/recommendation/generate",

    asyncHandler(async (req, res) => {
      const { sessionId, candidatos } = req.body || {};

      // -----------------------------------------------------------------------
      // VALIDACIONES
      // -----------------------------------------------------------------------

      if (!openai) {
        return res.status(500).json({
          ok: false,
          error: "OpenAI no esta configurado",
        });
      }

      if (!sessionId) {
        return res.status(400).json({
          ok: false,
          error: "Falta sessionId",
        });
      }

      if (!Array.isArray(candidatos) || candidatos.length === 0) {
        return res.status(400).json({
          ok: false,
          error: "Faltan candidatos",
        });
      }

      // -----------------------------------------------------------------------
      // SESION
      // -----------------------------------------------------------------------

      const sessionKey = `advisor:sesion:${sessionId}`;

      const sesion = await cacheGet(sessionKey);

      if (!sesion) {
        return res.status(404).json({
          ok: false,
          error: "No existe la sesion del asesor",
        });
      }

      if (!Array.isArray(sesion?.comparacion?.seleccion)) {
        return res.status(400).json({
          ok: false,
          error: "La sesion no tiene una comparacion guardada",
        });
      }

      const comparacion = sesion.comparacion;

      // -----------------------------------------------------------------------
      // VARIABLES DEL PROMPT
      // -----------------------------------------------------------------------

      const seleccionDetallada = armarSeleccionDetallada(
        comparacion,
        indexarEquiposCandidatos(candidatos)
      );

      const verificaciones = armarVerificaciones(comparacion);

      const productosNoDisponibles =
        sesion.registro?.busqueda?.productos_no_disponibles || [];

      const prompt = prompt6Recomendacion({
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
          seleccionDetallada,
          null,
          2
        ),

        verificacionesTecnicas:
          verificaciones.length > 0
            ? verificaciones.map((dato) => `- ${dato}`).join("\n")
            : "Ninguna",

        productosNoDisponibles:
          productosNoDisponibles.length > 0
            ? productosNoDisponibles
                .map((producto) => `- ${producto}`)
                .join("\n")
            : "Ninguno",
      });

      // -----------------------------------------------------------------------
      // PROMPT 6A
      // -----------------------------------------------------------------------

      const modelo =
        process.env.ADVISOR_RECOMMENDATION_MODEL ||
        process.env.ADVISOR_PREPARATION_MODEL ||
        "gpt-5.1";

      const inicio = Date.now();

      let textoIA;

      try {
        const completion = await openai.chat.completions.create({
          model: modelo,

          messages: [
            {
              role: "user",
              content: prompt,
            },
          ],
        });

        textoIA =
          completion.choices?.[0]?.message?.content?.trim();
      } catch (error) {
        return res.status(500).json({
          ok: false,
          error: `Prompt 6A fallo: ${error.message}`,
        });
      }

      const duracionMs = Date.now() - inicio;

      console.log(`PROMPT6A: ${duracionMs}ms`);

      if (!textoIA) {
        return res.status(500).json({
          ok: false,
          error: "Prompt 6A no devolvio un mensaje para el cliente",
        });
      }

      // -----------------------------------------------------------------------
      // TAGS
      // -----------------------------------------------------------------------

      const { texto: mensajeCliente, tags } =
        validarTags(textoIA, comparacion);

      if (tags.descartados.length > 0) {
        console.warn(
          "PROMPT6A TAGS DESCARTADOS:",
          tags.descartados
        );
      }

      // -----------------------------------------------------------------------
      // GUARDAR SESION
      // -----------------------------------------------------------------------
      //
      // Se guardan los candidatos (con sus fichas), la recomendación entregada
      // y la fase: el Prompt 6B los va a usar para responder repreguntas.
      //

      await cacheSet(
        sessionKey,
        {
          ...sesion,

          // A partir de acá, el próximo mensaje del cliente va al Prompt 6B
          // (repreguntas) en vez de rehacer diagnóstico y comparación.
          fase: "recomendacion",

          candidatos,

          recomendacion: {
            mensajeCliente,

            tags: {
              recomendar: tags.recomendar,
              alternativa: tags.alternativa,
            },

            seleccionDetallada,

            generadaEn: new Date().toISOString(),
          },

          actualizadoEn: new Date().toISOString(),
        },
        0
      );

      // -----------------------------------------------------------------------
      // RESPUESTA
      // -----------------------------------------------------------------------

      return res.json({
        ok: true,

        sessionId,

        mensajeCliente,

        tarjetas: {
          recomendar: tags.recomendar,
          alternativa: tags.alternativa,
        },

        tiempoPrompt6AMs: duracionMs,
      });
    })
  );
}