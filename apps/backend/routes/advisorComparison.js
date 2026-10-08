// apps/backend/routes/advisorComparison.js

import { prompt5Comparacion } from "../advisor/prompt/prompt5Comparacion.js";

// -----------------------------------------------------------------------------
// UTILIDADES DE IDs
// -----------------------------------------------------------------------------

function idsCandidatos(candidatos) {
  const ids = new Set();

  for (const etapa of candidatos || []) {
    for (const opcion of etapa?.opciones || []) {
      for (const equipo of opcion?.equipos || []) {
        if (equipo?.id) {
          ids.add(String(equipo.id));
        }

        if (equipo?.idBusquetti) {
          ids.add(String(equipo.idBusquetti));
        }
      }

      for (const id of opcion?.ids || []) {
        if (id) {
          ids.add(String(id));
        }
      }
    }
  }

  return ids;
}

function idsSeleccionados(comparacion) {
  const ids = [];

  for (const etapa of comparacion?.seleccion || []) {
    for (const recomendado of etapa?.recomendados || []) {
      for (const id of recomendado?.ids || []) {
        ids.push(String(id));
      }
    }

    for (const alternativa of etapa?.alternativas_a_confirmar || []) {
      for (const id of alternativa?.ids || []) {
        ids.push(String(id));
      }
    }

    for (const descarte of etapa?.descartes_a_explicar || []) {
      for (const id of descarte?.ids || []) {
        ids.push(String(id));
      }
    }
  }

  return ids;
}

// -----------------------------------------------------------------------------
// VALIDACIÓN GENERAL DEL JSON DE PROMPT 5
// -----------------------------------------------------------------------------
//
// Esta validación no decide técnicamente si un equipo sirve o no.
// Solo comprueba que Prompt 5 haya respetado el contrato de salida.
//
// Si algo falta:
// - NO lo completa el código;
// - NO inventamos ningún valor;
// - se considera una inconsistencia;
// - se permite un único reintento de Prompt 5.
//

function validarComparacionBasica(resultado) {
  if (!resultado || typeof resultado !== "object") {
    return "Prompt 5 no devolvió un objeto";
  }

  if (!["preguntar", "listo"].includes(resultado.accion)) {
    return 'Prompt 5 devolvió una accion inválida. Debe ser "preguntar" o "listo"';
  }

  if (!Array.isArray(resultado.datos_obtenidos)) {
    return "Prompt 5 no devolvió datos_obtenidos como array";
  }

  if (!Array.isArray(resultado.evaluacion_equipos)) {
    return "Prompt 5 no devolvió evaluacion_equipos como array";
  }

  if (!Array.isArray(resultado.evaluacion_opciones)) {
    return "Prompt 5 no devolvió evaluacion_opciones como array";
  }

  if (!Array.isArray(resultado.seleccion)) {
    return "Prompt 5 no devolvió seleccion como array";
  }

  if (resultado.accion === "preguntar") {
    if (
      typeof resultado.mensaje_cliente !== "string" ||
      !resultado.mensaje_cliente.trim()
    ) {
      return 'Prompt 5 devolvió accion "preguntar" pero sin mensaje_cliente';
    }
  }

  if (
    resultado.accion === "listo" &&
    resultado.mensaje_cliente !== null
  ) {
    return 'Prompt 5 devolvió accion "listo" pero mensaje_cliente no es null';
  }

  // ---------------------------------------------------------------------------
  // VALIDACIÓN DE CADA EQUIPO
  // ---------------------------------------------------------------------------

  for (const equipo of resultado.evaluacion_equipos) {
    if (!equipo?.id) {
      return "Prompt 5 devolvió un equipo sin id";
    }

    if (!equipo?.etapa) {
      return `Prompt 5 devolvió el equipo "${equipo.id}" sin etapa`;
    }

    if (!Array.isArray(equipo?.criterios)) {
      return `Prompt 5 devolvió el equipo "${equipo.id}" sin criterios`;
    }

    if (
      typeof equipo?.capacidad_evaluable !== "boolean"
    ) {
      return `Prompt 5 devolvió el equipo "${equipo.id}" sin capacidad_evaluable válida`;
    }

    if (
      !equipo?.capacidad_diaria ||
      typeof equipo.capacidad_diaria !== "object"
    ) {
      return `Prompt 5 devolvió el equipo "${equipo.id}" sin capacidad_diaria`;
    }

    if (
      !Object.prototype.hasOwnProperty.call(
        equipo.capacidad_diaria,
        "valor"
      )
    ) {
      return `Prompt 5 devolvió el equipo "${equipo.id}" sin capacidad_diaria.valor`;
    }

    if (
      !Array.isArray(
        equipo.capacidad_diaria.factores
      )
    ) {
      return `Prompt 5 devolvió el equipo "${equipo.id}" sin capacidad_diaria.factores`;
    }

    if (
      !Array.isArray(
        equipo.capacidad_diaria.divisores
      )
    ) {
      return `Prompt 5 devolvió el equipo "${equipo.id}" sin capacidad_diaria.divisores`;
    }

    if (
      !equipo?.volumen_a_cubrir ||
      typeof equipo.volumen_a_cubrir !== "object"
    ) {
      return `Prompt 5 devolvió el equipo "${equipo.id}" sin volumen_a_cubrir`;
    }

    if (
      !Object.prototype.hasOwnProperty.call(
        equipo.volumen_a_cubrir,
        "valor"
      )
    ) {
      return `Prompt 5 devolvió el equipo "${equipo.id}" sin volumen_a_cubrir.valor`;
    }

    if (
      !["compatible", "descartado", "a_confirmar"].includes(
        equipo?.resultado
      )
    ) {
      return `Prompt 5 devolvió el equipo "${equipo.id}" con resultado inválido`;
    }

    if (
      equipo.resultado === "compatible" &&
      equipo.motivo !== null
    ) {
      return `Prompt 5 devolvió el equipo "${equipo.id}" como compatible pero motivo no es null`;
    }

    if (
      ["descartado", "a_confirmar"].includes(
        equipo.resultado
      ) &&
      (
        typeof equipo.motivo !== "string" ||
        !equipo.motivo.trim()
      )
    ) {
      return `Prompt 5 devolvió el equipo "${equipo.id}" como "${equipo.resultado}" pero sin motivo`;
    }
  }

  return null;
}

// -----------------------------------------------------------------------------
// DATOS DE COMPARACIÓN YA RESUELTOS
// -----------------------------------------------------------------------------

function datosComparacionPorNombre(datosComparacion) {
  const mapa = new Map();

  for (const item of datosComparacion || []) {
    if (!item?.dato) {
      continue;
    }

    mapa.set(String(item.dato), item);
  }

  return mapa;
}

// -----------------------------------------------------------------------------
// ENRIQUECER FICHAS CON EL ESQUEMA DEL TIPO
// -----------------------------------------------------------------------------
//
// La ficha contiene valores, estados, detalles y fuentes.
//
// La condición:
// - a = capacidad
// - b = instalación
// - c = producto/proceso
//
// pertenece al esquema del tipo.
//
// Por eso el código toma la estructura a/b/c directamente desde:
// advisor:esquema:<tipoEquipo>
//
// No hardcodeamos campos técnicos en esta ruta.
//

function extraerCamposDeEsquemaGuardado(esquemaGuardado) {
  if (!esquemaGuardado) {
    return [];
  }

  const esquema =
    esquemaGuardado?.esquema?.esquema ||
    esquemaGuardado?.esquema ||
    esquemaGuardado;

  if (!Array.isArray(esquema?.campos)) {
    return [];
  }

  return esquema.campos;
}

async function enriquecerCandidatosConEsquemas(
  candidatos,
  cacheGet
) {
  const camposPorTipo = new Map();

  async function camposPrompt5(tipoEquipo) {
    const tipo = String(tipoEquipo || "").trim();

    if (!tipo) {
      throw new Error(
        "Hay un equipo candidato sin tipoEquipo y no se puede buscar su esquema"
      );
    }

    if (camposPorTipo.has(tipo)) {
      return camposPorTipo.get(tipo);
    }

    const key = `advisor:esquema:${tipo}`;

    const esquemaGuardado = await cacheGet(key);

    const camposEsquema =
      extraerCamposDeEsquemaGuardado(
        esquemaGuardado
      );

    if (camposEsquema.length === 0) {
      throw new Error(
        `No existe un esquema válido en Redis para el tipo "${tipo}"`
      );
    }

    const campos = camposEsquema
      .filter(
        (campo) =>
          campo?.nombre &&
          ["a", "b", "c"].includes(
            campo?.condicion
          )
      )
      .map((campo) => ({
        campo: campo.nombre,
        condicion: campo.condicion,
        descripcion:
          campo.descripcion ?? null,
        tipo:
          campo.tipo ?? null,
        unidad:
          campo.unidad ?? null,
      }));

    if (campos.length === 0) {
      throw new Error(
        `El esquema del tipo "${tipo}" no tiene campos válidos para comparación`
      );
    }

    camposPorTipo.set(tipo, campos);

    return campos;
  }

  const etapasEnriquecidas = [];

  for (const etapa of candidatos || []) {
    const opcionesEnriquecidas = [];

    for (const opcion of etapa?.opciones || []) {
      const equiposEnriquecidos = [];

      for (const equipo of opcion?.equipos || []) {
        if (!equipo?.ficha) {
          throw new Error(
            `El equipo "${equipo?.id || "sin_id"}" no tiene ficha para comparar`
          );
        }

        const campos =
          await camposPrompt5(
            equipo.tipoEquipo
          );

        equiposEnriquecidos.push({
          ...equipo,

          ficha: {
            ...equipo.ficha,

            // Siempre usamos las condiciones
            // provenientes del esquema real.
            campos,
          },
        });
      }

      opcionesEnriquecidas.push({
        ...opcion,
        equipos:
          equiposEnriquecidos,
      });
    }

    etapasEnriquecidas.push({
      ...etapa,
      opciones:
        opcionesEnriquecidas,
    });
  }

  return etapasEnriquecidas;
}

// -----------------------------------------------------------------------------
// CRITERIOS QUE REQUIEREN UN DATO DEL CLIENTE
// -----------------------------------------------------------------------------

function criteriosClienteDecisivos(resultado) {
  const encontrados = [];

  const datosObtenidos =
    datosComparacionPorNombre(
      resultado?.datos_obtenidos || []
    );

  for (
    const equipo of
    resultado?.evaluacion_equipos || []
  ) {
    for (
      const criterio of
      equipo?.criterios || []
    ) {
      if (criterio?.aplicable !== true) {
        continue;
      }

      if (
        criterio?.resultado !==
        "no_confirmable"
      ) {
        continue;
      }

      if (
        criterio?.origen_no_confirmable !==
        "cliente"
      ) {
        continue;
      }

      if (
        criterio?.puede_cambiar_resultado !==
        true
      ) {
        continue;
      }

      const datoFaltante =
        typeof criterio?.dato_faltante ===
        "string"
          ? criterio.dato_faltante.trim()
          : "";

      if (!datoFaltante) {
        continue;
      }

      // Si el propio análisis ya registró el dato
      // como confirmado o no disponible,
      // no corresponde volver a preguntarlo.
      const datoYaRegistrado =
        datosObtenidos.get(
          datoFaltante
        );

      if (
        datoYaRegistrado?.estado ===
          "confirmado" ||
        datoYaRegistrado?.estado ===
          "no_disponible"
      ) {
        continue;
      }

      encontrados.push({
        equipoId:
          equipo?.id || null,

        etapa:
          equipo?.etapa || null,

        campo:
          criterio?.campo || null,

        datoFaltante,

        detalle:
          criterio?.detalle || null,
      });
    }
  }

  return encontrados;
}

// -----------------------------------------------------------------------------
// VALIDACIÓN MATEMÁTICA DE CAPACIDADES
// -----------------------------------------------------------------------------
//
// El código NO decide qué fórmula usar.
//
// La fórmula, factores y divisores los propone Prompt 5.
//
// El código solamente comprueba:
//
// valor = producto(factores) / producto(divisores)
//
// De esta forma:
// - la comparación sigue siendo dinámica;
// - no hardcodeamos máquinas ni fórmulas;
// - evitamos que la IA devuelva un número distinto
//   del resultado de su propia operación.
//

function inconsistenciasDeCapacidad(resultado) {
  const inconsistencias = [];

  function calcularOperacion(factores, divisores) {
    const productoFactores = factores.reduce(
      (acumulado, valor) => acumulado * valor,
      1
    );

    const productoDivisores = divisores.reduce(
      (acumulado, valor) => acumulado * valor,
      1
    );

    return productoFactores / productoDivisores;
  }

  function valoresNumericosValidos(items) {
    return items.every(
      (item) =>
        typeof item?.valor === "number" &&
        Number.isFinite(item.valor)
    );
  }

  function diferenciaValida(valorInformado, valorCalculado) {
    const tolerancia = Math.max(
      0.000001,
      Math.abs(valorCalculado) * 0.000001
    );

    return (
      Math.abs(valorInformado - valorCalculado) <=
      tolerancia
    );
  }

  function validarElementoDerivado({
    elemento,
    equipoId,
    ruta,
  }) {
    if (!elemento) {
      return;
    }

    // Si este valor no es derivado,
    // no hay cálculo interno que validar.
    if (elemento.origen !== "derivado") {
      return;
    }

    const derivacion = elemento.derivacion;

    if (
      !derivacion ||
      typeof derivacion !== "object"
    ) {
      inconsistencias.push({
        equipoId,
        motivo:
          "valor_derivado_sin_derivacion",
        ruta,
        nombre:
          elemento.nombre || null,
        valorInformado:
          elemento.valor ?? null,
      });

      return;
    }

    if (
      !Array.isArray(
        derivacion.factores
      ) ||
      derivacion.factores.length === 0
    ) {
      inconsistencias.push({
        equipoId,
        motivo:
          "derivacion_sin_factores",
        ruta,
        nombre:
          elemento.nombre || null,
        valorInformado:
          elemento.valor ?? null,
      });

      return;
    }

    const factores =
      derivacion.factores;

    const divisores =
      Array.isArray(
        derivacion.divisores
      )
        ? derivacion.divisores
        : [];

    if (
      !valoresNumericosValidos(
        factores
      )
    ) {
      inconsistencias.push({
        equipoId,
        motivo:
          "factor_derivacion_invalido",
        ruta,
        nombre:
          elemento.nombre || null,
        factores,
      });

      return;
    }

    if (
      !valoresNumericosValidos(
        divisores
      ) ||
      divisores.some(
        (divisor) =>
          divisor.valor === 0
      )
    ) {
      inconsistencias.push({
        equipoId,
        motivo:
          "divisor_derivacion_invalido",
        ruta,
        nombre:
          elemento.nombre || null,
        divisores,
      });

      return;
    }

    const valorCalculado =
      calcularOperacion(
        factores.map(
          (factor) =>
            factor.valor
        ),
        divisores.map(
          (divisor) =>
            divisor.valor
        )
      );

    if (
      typeof elemento.valor !==
        "number" ||
      !Number.isFinite(
        elemento.valor
      )
    ) {
      inconsistencias.push({
        equipoId,
        motivo:
          "valor_derivado_no_numerico",
        ruta,
        nombre:
          elemento.nombre || null,
        valorInformado:
          elemento.valor,
        valorCalculado,
      });

      return;
    }

    if (
      !diferenciaValida(
        elemento.valor,
        valorCalculado
      )
    ) {
      inconsistencias.push({
        equipoId,
        motivo:
          "valor_derivado_no_coincide_con_operacion",
        ruta,
        nombre:
          elemento.nombre || null,
        valorInformado:
          elemento.valor,
        valorCalculado,
        factores:
          derivacion.factores,
        divisores:
          derivacion.divisores || [],
      });
    }

    // Esto permite soportar derivaciones
    // anidadas en el futuro sin hardcodear
    // ningún tipo de cálculo.
    for (
      const factor of
      factores
    ) {
      validarElementoDerivado({
        elemento: factor,
        equipoId,
        ruta:
          `${ruta}.derivacion.factores`,
      });
    }

    for (
      const divisor of
      divisores
    ) {
      validarElementoDerivado({
        elemento: divisor,
        equipoId,
        ruta:
          `${ruta}.derivacion.divisores`,
      });
    }
  }

  for (
    const equipo of
    resultado?.evaluacion_equipos || []
  ) {
    const capacidad =
      equipo?.capacidad_diaria;

    if (!capacidad) {
      continue;
    }

    const equipoId =
      equipo?.id || null;

    // ---------------------------------------------------------
    // PRIMERO VALIDAMOS LOS VALORES DERIVADOS INTERNOS
    // ---------------------------------------------------------

    for (
      const factor of
      capacidad.factores || []
    ) {
      validarElementoDerivado({
        elemento: factor,
        equipoId,
        ruta:
          "capacidad_diaria.factores",
      });
    }

    for (
      const divisor of
      capacidad.divisores || []
    ) {
      validarElementoDerivado({
        elemento: divisor,
        equipoId,
        ruta:
          "capacidad_diaria.divisores",
      });
    }

    // ---------------------------------------------------------
    // DESPUÉS VALIDAMOS EL CÁLCULO FINAL DE CAPACIDAD
    // ---------------------------------------------------------

    if (
      capacidad.valor === null
    ) {
      continue;
    }

    if (
      typeof capacidad.valor !==
        "number" ||
      !Number.isFinite(
        capacidad.valor
      )
    ) {
      inconsistencias.push({
        equipoId,
        motivo:
          "capacidad_valor_no_numerico",
        valorInformado:
          capacidad.valor,
      });

      continue;
    }

    if (
      !Array.isArray(
        capacidad.factores
      ) ||
      capacidad.factores.length === 0
    ) {
      inconsistencias.push({
        equipoId,
        motivo:
          "capacidad_sin_factores",
        valorInformado:
          capacidad.valor,
      });

      continue;
    }

    if (
      !valoresNumericosValidos(
        capacidad.factores
      )
    ) {
      inconsistencias.push({
        equipoId,
        motivo:
          "factor_invalido",
        factores:
          capacidad.factores,
      });

      continue;
    }

    const divisores =
      Array.isArray(
        capacidad.divisores
      )
        ? capacidad.divisores
        : [];

    if (
      !valoresNumericosValidos(
        divisores
      ) ||
      divisores.some(
        (divisor) =>
          divisor.valor === 0
      )
    ) {
      inconsistencias.push({
        equipoId,
        motivo:
          "divisor_invalido",
        divisores,
      });

      continue;
    }

    const valorCalculado =
      calcularOperacion(
        capacidad.factores.map(
          (factor) =>
            factor.valor
        ),
        divisores.map(
          (divisor) =>
            divisor.valor
        )
      );

    if (
      !diferenciaValida(
        capacidad.valor,
        valorCalculado
      )
    ) {
      inconsistencias.push({
        equipoId,
        motivo:
          "capacidad_no_coincide_con_operacion",
        valorInformado:
          capacidad.valor,
        valorCalculado,
        factores:
          capacidad.factores,
        divisores,
      });
    }
  }

  return inconsistencias;
}

// -----------------------------------------------------------------------------
// CONSISTENCIA ENTRE EL ANÁLISIS Y LA ACCIÓN PROPUESTA POR LA IA
// -----------------------------------------------------------------------------

function inconsistenciaDeAccion({
  resultado,
  criteriosDecisivos,
  preguntasRealizadas,
  maxPreguntasComparacion,
}) {
  const puedeSeguirPreguntando =
    preguntasRealizadas <
    maxPreguntasComparacion;

  // Existe un dato del cliente que puede
  // cambiar la decisión y todavía podemos preguntar.
  if (
    criteriosDecisivos.length > 0 &&
    puedeSeguirPreguntando &&
    resultado.accion !== "preguntar"
  ) {
    return "hay_dato_cliente_decisivo_pero_accion_es_listo";
  }

  // Si propone una pregunta, tiene que existir
  // un criterio estructurado que la justifique.
  if (
    resultado.accion === "preguntar" &&
    criteriosDecisivos.length === 0
  ) {
    return "accion_preguntar_sin_criterio_cliente_decisivo";
  }

  return null;
}

// -----------------------------------------------------------------------------
// EVALUAR CONSISTENCIAS DEL RESULTADO
// -----------------------------------------------------------------------------
//
// Centralizamos acá los controles posteriores a Prompt 5.
//
// Orden:
// 1. estructura;
// 2. matemática;
// 3. coherencia preguntar/listo.
//
// Devuelve todo lo necesario para:
// - aceptar el resultado;
// - reintentar;
// - o informar el error final.
//

function evaluarConsistenciaResultado({
  resultado,
  preguntasRealizadas,
  maxPreguntasComparacion,
}) {
  const errorValidacion =
    validarComparacionBasica(
      resultado
    );

  // Si la estructura está incompleta,
  // todavía no podemos confiar en los
  // campos internos para otros controles.
  if (errorValidacion) {
    return {
      inconsistencia:
        "estructura_respuesta_invalida",

      errorValidacion,

      erroresCapacidad: [],

      criteriosDecisivos: [],

      inconsistenciaAccion: null,
    };
  }

  const criteriosDecisivos =
    criteriosClienteDecisivos(
      resultado
    );

  const erroresCapacidad =
    inconsistenciasDeCapacidad(
      resultado
    );

  const inconsistenciaAccion =
    inconsistenciaDeAccion({
      resultado,
      criteriosDecisivos,
      preguntasRealizadas,
      maxPreguntasComparacion,
    });

  if (
    erroresCapacidad.length > 0
  ) {
    return {
      inconsistencia:
        "capacidad_matematicamente_inconsistente",

      errorValidacion: null,

      erroresCapacidad,

      criteriosDecisivos,

      inconsistenciaAccion,
    };
  }

  if (inconsistenciaAccion) {
    return {
      inconsistencia:
        inconsistenciaAccion,

      errorValidacion: null,

      erroresCapacidad,

      criteriosDecisivos,

      inconsistenciaAccion,
    };
  }

  return {
    inconsistencia: null,

    errorValidacion: null,

    erroresCapacidad: [],

    criteriosDecisivos,

    inconsistenciaAccion: null,
  };
}

// -----------------------------------------------------------------------------
// EJECUCIÓN DE PROMPT 5
// -----------------------------------------------------------------------------

async function ejecutarPrompt5(
  openai,
  prompt
) {
  const completion =
    await openai.chat.completions.create({
      model:
        process.env
          .ADVISOR_COMPARISON_MODEL ||
        process.env
          .ADVISOR_PREPARATION_MODEL ||
        "gpt-5.1",

      messages: [
        {
          role: "user",
          content: prompt,
        },
      ],

      response_format: {
        type: "json_object",
      },
    });

  const texto =
    completion.choices?.[0]?.message?.content?.trim();

  if (!texto) {
    throw new Error(
      "Prompt 5 no devolvió contenido"
    );
  }

  try {
    return JSON.parse(texto);
  } catch {
    const error =
      new Error(
        "Prompt 5 devolvió un JSON inválido"
      );

    error.raw = texto;

    throw error;
  }
}

// -----------------------------------------------------------------------------
// RUTAS
// -----------------------------------------------------------------------------

export function registerAdvisorComparisonRoutes(
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
    "/advisor/comparison/analyze",

    asyncHandler(
      async (req, res) => {
        const {
          sessionId,
          candidatos,
          historial,
          maxPreguntasComparacion = 3,
        } = req.body || {};

        // ---------------------------------------------------------------------
        // VALIDACIONES DE ENTRADA
        // ---------------------------------------------------------------------

        if (!openai) {
          return res.status(500).json({
            ok: false,
            error:
              "OpenAI no está configurado",
          });
        }

        if (!sessionId) {
          return res.status(400).json({
            ok: false,
            error:
              "Falta sessionId",
          });
        }

        if (
          !Array.isArray(
            candidatos
          ) ||
          candidatos.length === 0
        ) {
          return res.status(400).json({
            ok: false,
            error:
              "Faltan candidatos",
          });
        }

        if (
          !Array.isArray(historial)
        ) {
          return res.status(400).json({
            ok: false,
            error:
              "Falta historial",
          });
        }

        if (
          !Number.isInteger(
            maxPreguntasComparacion
          ) ||
          maxPreguntasComparacion < 0
        ) {
          return res.status(400).json({
            ok: false,
            error:
              "maxPreguntasComparacion inválido",
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

        if (!sesionGuardada) {
          return res.status(404).json({
            ok: false,
            error:
              "No existe la sesión del asesor",
          });
        }

        if (
          !sesionGuardada.registro
        ) {
          return res.status(400).json({
            ok: false,
            error:
              "La sesión no tiene un diagnóstico guardado",
          });
        }

        const registroCliente =
          sesionGuardada.registro;

        const datosComparacion =
          Array.isArray(
            sesionGuardada
              .datosComparacion
          )
            ? sesionGuardada
                .datosComparacion
            : [];

        const preguntasRealizadas =
          Number.isInteger(
            sesionGuardada
              .preguntasComparacionRealizadas
          )
            ? sesionGuardada
                .preguntasComparacionRealizadas
            : 0;

        // ---------------------------------------------------------------------
        // ENRIQUECER CANDIDATOS CON ESQUEMAS DE REDIS
        // ---------------------------------------------------------------------

        let candidatosConEsquemas;

        try {
          candidatosConEsquemas =
            await enriquecerCandidatosConEsquemas(
              candidatos,
              cacheGet
            );
        } catch (error) {
          return res
            .status(500)
            .json({
              ok: false,
              error:
                error.message,
            });
        }

        // ---------------------------------------------------------------------
        // PROMPT BASE
        // ---------------------------------------------------------------------

        const promptBase =
          prompt5Comparacion({
            reglasComunes,

            registroCliente,

            datosComparacion,

            candidatos:
              candidatosConEsquemas,

            historial,

            maxPreguntasComparacion,
          });

        // ---------------------------------------------------------------------
        // PRIMERA EJECUCIÓN
        // ---------------------------------------------------------------------

        let resultado;

        try {
          resultado =
            await ejecutarPrompt5(
              openai,
              promptBase
            );
        } catch (error) {
          return res
            .status(500)
            .json({
              ok: false,
              error:
                error.message,
              raw:
                error.raw,
            });
        }

        // ---------------------------------------------------------------------
        // PRIMER CONTROL
        // ---------------------------------------------------------------------

        let control =
          evaluarConsistenciaResultado({
            resultado,

            preguntasRealizadas,

            maxPreguntasComparacion,
          });

        let reintentoComparacion =
          false;

        // ---------------------------------------------------------------------
        // UN ÚNICO REINTENTO
        // ---------------------------------------------------------------------
        //
        // Reintentamos si ocurrió cualquiera de estos casos:
        //
        // - estructura incompleta;
        // - cálculo matemático inconsistente;
        // - preguntar/listo incompatible con los criterios.
        //
        // El código NO completa la respuesta.
        //
        // Solo informa a Prompt 5 qué inconsistencia detectó
        // y le exige rehacer el JSON completo.
        //

        if (
          control.inconsistencia
        ) {
          reintentoComparacion =
            true;

          const detalleEstructura =
            control.errorValidacion ||
            "Ninguno";

          const detalleCapacidad =
            control
              .erroresCapacidad
              .length > 0
              ? JSON.stringify(
                  control
                    .erroresCapacidad,
                  null,
                  2
                )
              : "[]";

          const detalleCriterios =
            control
              .criteriosDecisivos
              .length > 0
              ? JSON.stringify(
                  control
                    .criteriosDecisivos,
                  null,
                  2
                )
              : "[]";

          const promptReintento = `
${promptBase}

CONTROL DE CONSISTENCIA DEL SISTEMA

Tu respuesta anterior no pudo ser aceptada.

TIPO DE INCONSISTENCIA DETECTADA:

${control.inconsistencia}

ERROR DE ESTRUCTURA:

${detalleEstructura}

ERRORES MATEMÁTICOS DE CAPACIDAD:

${detalleCapacidad}

CRITERIOS DEL CLIENTE QUE PUEDEN CAMBIAR EL RESULTADO:

${detalleCriterios}

Debés rehacer TODA la respuesta de Prompt 5 desde cero y devolver nuevamente el JSON completo.

REGLAS OBLIGATORIAS DEL REINTENTO

1. RESPETÁ COMPLETAMENTE EL FORMATO DE SALIDA

No omitas campos obligatorios.

Cada elemento de evaluacion_equipos debe contener, entre otros:

- id
- etapa
- marca
- capacidad_evaluable
- criterios
- capacidad_diaria
- volumen_a_cubrir
- resultado
- motivo

Aunque un valor no pueda determinarse, el campo debe existir con el valor null que corresponda según las reglas.

No elimines un campo simplemente porque no sea relevante o porque su valor sea null.

2. volumen_a_cubrir ES OBLIGATORIO

Cada equipo de evaluacion_equipos debe contener:

"volumen_a_cubrir": {
  "valor": número o null,
  "unidad": "kg de harina por día"
}

Determiná el valor siguiendo las reglas de capacidad y los datos del registro del cliente.

No omitas este objeto.

3. RESULTADO Y MOTIVO SON OBLIGATORIOS

Cada equipo debe contener:

"resultado": "compatible | descartado | a_confirmar"

y:

"motivo": null o texto según corresponda.

4. CONTROL MATEMÁTICO

Cuando capacidad_diaria.valor no sea null:

- debe existir al menos un factor;
- todos los factores deben ser numéricos;
- todos los divisores deben ser numéricos;
- ningún divisor puede ser cero;
- capacidad_diaria.valor debe ser exactamente:

producto(factores) / producto(divisores)

- el texto de calculo debe describir exactamente esa misma operación;
- no cambies el resultado después de calcularlo;
- no agregues factores de eficiencia, márgenes ni ajustes no documentados.

5. DATOS DERIVADOS DEL CLIENTE

Interpretá correctamente las unidades y el significado de cada dato.

Una cantidad de turnos no representa una cantidad de horas.

Cuando un dato necesario surja de una relación matemática directa entre datos confirmados del cliente, realizá correctamente esa derivación y usá el resultado derivado.

No confundas:

- cantidad;
- duración;
- frecuencia;
- tiempo total;
- producción;
- capacidad.

6. CONTROL DE CRITERIOS

Revisá especialmente:

- aplicable;
- resultado;
- origen_no_confirmable;
- dato_faltante;
- puede_cambiar_resultado.

Si existe un criterio con:

aplicable = true
resultado = "no_confirmable"
origen_no_confirmable = "cliente"
puede_cambiar_resultado = true

y todavía pueden hacerse preguntas, la acción debe ser:

"preguntar"

Si la acción es "preguntar", debe existir al menos un criterio estructurado que justifique esa pregunta.

7. NO CORRIJAS SOLO EL CAMPO MARCADO

Reevaluá la respuesta completa.

Una corrección no puede generar inconsistencias nuevas en otros campos.

Devolvé únicamente el JSON completo de Prompt 5 corregido.
`.trim();

          try {
            resultado =
              await ejecutarPrompt5(
                openai,
                promptReintento
              );
          } catch (error) {
            return res
              .status(500)
              .json({
                ok: false,
                error:
                  error.message,
                raw:
                  error.raw,
              });
          }

          // -------------------------------------------------------------------
          // SEGUNDO Y ÚLTIMO CONTROL
          // -------------------------------------------------------------------

          control =
            evaluarConsistenciaResultado({
              resultado,

              preguntasRealizadas,

              maxPreguntasComparacion,
            });
        }

        // ---------------------------------------------------------------------
        // SI EL REINTENTO TAMBIÉN FALLÓ
        // ---------------------------------------------------------------------

        if (
          control.inconsistencia
        ) {
          return res
            .status(500)
            .json({
              ok: false,

              error:
                "Prompt 5 mantuvo una inconsistencia después del reintento",

              inconsistencia:
                control.inconsistencia,

              errorValidacion:
                control.errorValidacion,

              erroresCapacidad:
                control.erroresCapacidad,

              criteriosDecisivos:
                control.criteriosDecisivos,

              resultado,
            });
        }

        // A partir de acá sabemos que:
        //
        // - la estructura está completa;
        // - la matemática de capacidad es consistente;
        // - preguntar/listo coincide con los criterios.

        const criteriosDecisivos =
          control.criteriosDecisivos;

        // ---------------------------------------------------------------------
        // MÁXIMO DE PREGUNTAS
        // ---------------------------------------------------------------------

        let accionFinal =
          resultado.accion;

        let mensajeClienteFinal =
          resultado.mensaje_cliente;

        const alcanzoMaximoPreguntas =
          preguntasRealizadas >=
          maxPreguntasComparacion;

        // Si se alcanzó el máximo,
        // el código impide una nueva repregunta.
        if (
          alcanzoMaximoPreguntas
        ) {
          accionFinal =
            "listo";

          mensajeClienteFinal =
            null;
        }

        // ---------------------------------------------------------------------
        // VALIDACIÓN DE IDs
        // ---------------------------------------------------------------------

        if (
          accionFinal === "listo"
        ) {
          const permitidos =
            idsCandidatos(
              candidatos
            );

          const seleccionados =
            idsSeleccionados(
              resultado
            );

          const invalidos =
            seleccionados.filter(
              (id) =>
                !permitidos.has(id)
            );

          if (
            invalidos.length > 0
          ) {
            return res
              .status(500)
              .json({
                ok: false,

                error:
                  "Prompt 5 seleccionó IDs que no existen entre los candidatos",

                idsInvalidos: [
                  ...new Set(
                    invalidos
                  ),
                ],
              });
          }
        }

        // ---------------------------------------------------------------------
        // GUARDADO DE SESIÓN
        // ---------------------------------------------------------------------

        const nuevaSesion = {
          ...sesionGuardada,

          datosComparacion:
            resultado.datos_obtenidos,

          actualizadoEn:
            new Date().toISOString(),
        };

        // ---------------------------------------------------------------------
        // SI HAY QUE PREGUNTAR
        // ---------------------------------------------------------------------

        if (
          accionFinal ===
          "preguntar"
        ) {
          const criterioPrincipal =
            criteriosDecisivos[0] ||
            null;

          nuevaSesion
            .preguntasComparacionRealizadas =
            preguntasRealizadas + 1;

          nuevaSesion
            .preguntaComparacionPendiente =
          {
            dato:
              criterioPrincipal
                ?.datoFaltante ||
              null,

            campo:
              criterioPrincipal
                ?.campo ||
              null,

            equipoId:
              criterioPrincipal
                ?.equipoId ||
              null,

            etapa:
              criterioPrincipal
                ?.etapa ||
              null,

            mensaje:
              mensajeClienteFinal,

            creadaEn:
              new Date().toISOString(),
          };

          // Todavía no existe
          // una comparación definitiva.
          delete nuevaSesion.comparacion;
        }

        // ---------------------------------------------------------------------
        // SI LA COMPARACIÓN TERMINÓ
        // ---------------------------------------------------------------------

        if (
          accionFinal === "listo"
        ) {
          nuevaSesion
            .preguntaComparacionPendiente =
            null;

          nuevaSesion.comparacion =
          {
            evaluacion_equipos:
              resultado
                .evaluacion_equipos,

            evaluacion_opciones:
              resultado
                .evaluacion_opciones,

            seleccion:
              resultado
                .seleccion,
          };
        }

        await cacheSet(
          sessionKey,
          nuevaSesion,
          0
        );

        // ---------------------------------------------------------------------
        // RESPUESTA
        // ---------------------------------------------------------------------

        return res.json({
          ok: true,

          sessionId,

          accion:
            accionFinal,

          mensajeCliente:
            mensajeClienteFinal,

          datosComparacion:
            resultado
              .datos_obtenidos,

          evaluacionEquipos:
            resultado
              .evaluacion_equipos,

          evaluacionOpciones:
            resultado
              .evaluacion_opciones,

          seleccion:
            resultado
              .seleccion,

          // Debug temporal mientras
          // validamos Prompt 5.
          reintentoComparacion,

          preguntasComparacionRealizadas:
            nuevaSesion
              .preguntasComparacionRealizadas ||
            0,

          preguntaComparacionPendiente:
            nuevaSesion
              .preguntaComparacionPendiente ||
            null,
        });
      }
    )
  );
}