// apps/backend/routes/advisorComparison.js

import { prompt5Comparacion } from "../advisor/prompt/prompt5Comparacion.js";
import { SESION_TTL_SEGUNDOS } from "../advisor/sesion.js";
import { registrarTiempo } from "../advisor/tiempos.js";
import { opcionesRazonamiento } from "../advisor/razonamiento.js";

function idsCandidatos(candidatos) {
  const ids = new Set();

  for (const etapa of candidatos || []) {
    for (const opcion of etapa?.opciones || []) {
      for (const equipo of opcion?.equipos || []) {
        if (equipo?.id) ids.add(String(equipo.id));
        if (equipo?.idBusquetti) ids.add(String(equipo.idBusquetti));
      }

      for (const id of opcion?.ids || []) {
        if (id) ids.add(String(id));
      }
    }
  }

  return ids;
}

function idsSeleccionados(comparacion) {
  const ids = [];

  for (const etapa of comparacion?.seleccion || []) {
    for (const item of etapa?.recomendados || []) {
      for (const id of item?.ids || []) {
        ids.push(String(id));
      }
    }

    for (const item of etapa?.alternativas_a_confirmar || []) {
      for (const id of item?.ids || []) {
        ids.push(String(id));
      }
    }

    for (const item of etapa?.descartes_a_explicar || []) {
      for (const id of item?.ids || []) {
        ids.push(String(id));
      }
    }
  }

  return ids;
}
// -----------------------------------------------------------------------------
// IDs DE EQUIPOS CON VERIFICACIONES TECNICAS
// -----------------------------------------------------------------------------
//
// Prompt 5 puede devolver requisitos técnicos que no bloquean la recomendación,
// pero que deben verificarse posteriormente antes de la instalación.
//
// Esta función extrae los IDs de esos equipos para poder comprobar después
// que Prompt 5 no haya inventado un equipo que no estaba entre los candidatos.
// -----------------------------------------------------------------------------

function idsVerificacionesTecnicas(comparacion) {
  const ids = [];

  for (
    const verificacion of
    comparacion?.verificaciones_tecnicas || []
  ) {
    if (verificacion?.equipo) {
      ids.push(
        String(verificacion.equipo)
      );
    }
  }

  return ids;
}
// -----------------------------------------------------------------------------
// VALIDACION ESTRUCTURAL
// -----------------------------------------------------------------------------
//
// Prompt 5 NO repregunta y NO se repara.
//
// Si falta información:
// - criterio: no_confirmable
// - equipo/opción: a_confirmar cuando corresponda
//
// a_confirmar es un resultado final válido.
// -----------------------------------------------------------------------------

function validarComparacionBasica(resultado) {
  if (!resultado || typeof resultado !== "object") {
    return "Prompt 5 no devolvio un objeto";
  }

  if (!Array.isArray(resultado.datos_obtenidos)) {
    return "Prompt 5 no devolvio datos_obtenidos como array";
  }
  // ---------------------------------------------------------------------------
// VERIFICACIONES TECNICAS
// ---------------------------------------------------------------------------
//
// Las verificaciones técnicas son requisitos que NO bloquean la recomendación,
// pero deben quedar registrados para una revisión posterior de instalación.
//
// Como Prompt 5 usa structured output estricto, esperamos siempre un array,
// aunque no exista ninguna verificación para esta etapa.
// ---------------------------------------------------------------------------

if (
  !Array.isArray(
    resultado.verificaciones_tecnicas
  )
) {
  return "Prompt 5 no devolvio verificaciones_tecnicas como array";
}

// Validamos únicamente la estructura.
//
// El código NO decide si una frecuencia, un neutro, una presión,
// una conexión de agua, etc. deben verificarse.
// Esa decisión sigue siendo responsabilidad de Prompt 5.
for (
  const verificacion of
  resultado.verificaciones_tecnicas
) {
  if (
    typeof verificacion?.equipo !==
      "string" ||
    !verificacion.equipo.trim()
  ) {
    return "Prompt 5 devolvio una verificacion tecnica sin equipo valido";
  }

  if (
    typeof verificacion?.etapa !==
      "string" ||
    !verificacion.etapa.trim()
  ) {
    return `Prompt 5 devolvio una verificacion tecnica del equipo "${verificacion.equipo}" sin etapa valida`;
  }

  if (
    typeof verificacion?.dato !==
      "string" ||
    !verificacion.dato.trim()
  ) {
    return `Prompt 5 devolvio una verificacion tecnica del equipo "${verificacion.equipo}" sin dato valido`;
  }

  if (
    typeof verificacion?.motivo !==
      "string" ||
    !verificacion.motivo.trim()
  ) {
    return `Prompt 5 devolvio una verificacion tecnica del equipo "${verificacion.equipo}" sin motivo valido`;
  }
}
  if (!Array.isArray(resultado.evaluacion_equipos)) {
    return "Prompt 5 no devolvio evaluacion_equipos como array";
  }

  if (!Array.isArray(resultado.evaluacion_opciones)) {
    return "Prompt 5 no devolvio evaluacion_opciones como array";
  }

  if (!Array.isArray(resultado.seleccion)) {
    return "Prompt 5 no devolvio seleccion como array";
  }

  for (const equipo of resultado.evaluacion_equipos) {
    if (!equipo?.id) {
      return "Prompt 5 devolvio un equipo sin id";
    }

    if (!equipo?.etapa) {
      return `Prompt 5 devolvio el equipo "${equipo.id}" sin etapa`;
    }

    if (!Array.isArray(equipo?.criterios)) {
      return `Prompt 5 devolvio el equipo "${equipo.id}" sin criterios`;
    }

    if (typeof equipo?.capacidad_evaluable !== "boolean") {
      return `Prompt 5 devolvio el equipo "${equipo.id}" sin capacidad_evaluable valida`;
    }

    if (
      !equipo?.capacidad_diaria ||
      typeof equipo.capacidad_diaria !== "object"
    ) {
      return `Prompt 5 devolvio el equipo "${equipo.id}" sin capacidad_diaria`;
    }

    if (
      !Object.prototype.hasOwnProperty.call(
        equipo.capacidad_diaria,
        "valor"
      )
    ) {
      return `Prompt 5 devolvio el equipo "${equipo.id}" sin capacidad_diaria.valor`;
    }

    if (!Array.isArray(equipo.capacidad_diaria.factores)) {
      return `Prompt 5 devolvio el equipo "${equipo.id}" sin capacidad_diaria.factores`;
    }

    if (!Array.isArray(equipo.capacidad_diaria.divisores)) {
      return `Prompt 5 devolvio el equipo "${equipo.id}" sin capacidad_diaria.divisores`;
    }

    if (
      !equipo?.volumen_a_cubrir ||
      typeof equipo.volumen_a_cubrir !== "object"
    ) {
      return `Prompt 5 devolvio el equipo "${equipo.id}" sin volumen_a_cubrir`;
    }

    if (
      !Object.prototype.hasOwnProperty.call(
        equipo.volumen_a_cubrir,
        "valor"
      )
    ) {
      return `Prompt 5 devolvio el equipo "${equipo.id}" sin volumen_a_cubrir.valor`;
    }

    if (
      ![
        "compatible",
        "descartado",
        "a_confirmar",
      ].includes(equipo?.resultado)
    ) {
      return `Prompt 5 devolvio el equipo "${equipo.id}" con resultado invalido`;
    }

    if (
      equipo.resultado === "compatible" &&
      equipo.motivo !== null
    ) {
      return `Prompt 5 devolvio el equipo "${equipo.id}" como compatible pero motivo no es null`;
    }

    if (
      [
        "descartado",
        "a_confirmar",
      ].includes(equipo.resultado) &&
      (
        typeof equipo.motivo !== "string" ||
        !equipo.motivo.trim()
      )
    ) {
      return `Prompt 5 devolvio el equipo "${equipo.id}" como "${equipo.resultado}" pero sin motivo`;
    }
  }

  return null;
}

// -----------------------------------------------------------------------------
// ENRIQUECER CANDIDATOS CON ESQUEMAS
// -----------------------------------------------------------------------------

function extraerCamposDeEsquemaGuardado(esquemaGuardado) {
  if (!esquemaGuardado) {
    return [];
  }

  const esquema =
    esquemaGuardado?.esquema?.esquema ||
    esquemaGuardado?.esquema ||
    esquemaGuardado;

  return Array.isArray(esquema?.campos)
    ? esquema.campos
    : [];
}

async function enriquecerCandidatosConEsquemas(
  candidatos,
  cacheGet
) {
  const camposPorTipo = new Map();

  async function obtenerCampos(tipoEquipo) {
    const tipo =
      String(
        tipoEquipo || ""
      ).trim();

    if (!tipo) {
      throw new Error(
        "Hay un equipo candidato sin tipoEquipo y no se puede buscar su esquema"
      );
    }

    if (camposPorTipo.has(tipo)) {
      return camposPorTipo.get(tipo);
    }

    const esquemaGuardado =
      await cacheGet(
        `advisor:esquema:${tipo}`
      );

    const camposEsquema =
      extraerCamposDeEsquemaGuardado(
        esquemaGuardado
      );

        // Si el esquema del tipo todavía no existe (la preparación automática lo
    // está generando), sus equipos se comparan sin campos: no se puede
    // confirmar nada y quedan "a confirmar". La conversación no se corta.
    if (camposEsquema.length === 0) {
      console.warn(
        `[advisor/comparison] Sin esquema para el tipo "${tipo}": sus equipos quedan a confirmar`
      );

      camposPorTipo.set(tipo, []);
      return [];
    }

    const campos =
      camposEsquema
        .filter(
          (campo) =>
            campo?.nombre &&
            [
              "a",
              "b",
              "c",
            ].includes(
              campo?.condicion
            )
        )
        .map(
          (campo) => ({
            campo:
              campo.nombre,

            condicion:
              campo.condicion,

            descripcion:
              campo.descripcion ??
              null,

            tipo:
              campo.tipo ??
              null,

            unidad:
              campo.unidad ??
              null,
          })
        );

    if (campos.length === 0) {
      throw new Error(
        `El esquema del tipo "${tipo}" no tiene campos validos para comparacion`
      );
    }

    camposPorTipo.set(
      tipo,
      campos
    );

    return campos;
  }

  const resultado = [];

  for (
    const etapa of
    candidatos || []
  ) {
    const opciones = [];

    for (
      const opcion of
      etapa?.opciones || []
    ) {
      const equipos = [];

      for (
        const equipo of
        opcion?.equipos || []
      ) {
        if (!equipo?.ficha) {
          throw new Error(
            `El equipo "${equipo?.id || "sin_id"}" no tiene ficha para comparar`
          );
        }

        const campos =
          await obtenerCampos(
            equipo.tipoEquipo
          );

        equipos.push({
          ...equipo,

          ficha: {
            ...equipo.ficha,
            campos,
          },
        });
      }

      opciones.push({
        ...opcion,
        equipos,
      });
    }

    resultado.push({
      ...etapa,
      opciones,
    });
  }

  return resultado;
}

// -----------------------------------------------------------------------------
// VALIDACION MATEMATICA DE CAPACIDADES
// -----------------------------------------------------------------------------
//
// El código no decide la fórmula técnica.
//
// Solo comprueba:
//
// valor = producto(factores) / producto(divisores)
//
// usando exclusivamente la operación que Prompt 5 declaró.
// -----------------------------------------------------------------------------

function inconsistenciasDeCapacidad(resultado) {
  const inconsistencias =
    [];

  const calcular = (
    factores,
    divisores
  ) => {
    const productoFactores =
      factores.reduce(
        (
          acumulado,
          valor
        ) =>
          acumulado *
          valor,
        1
      );

    const productoDivisores =
      divisores.reduce(
        (
          acumulado,
          valor
        ) =>
          acumulado *
          valor,
        1
      );

    return (
      productoFactores /
      productoDivisores
    );
  };

  const numericosValidos =
    (items) =>
      items.every(
        (item) =>
          typeof item?.valor ===
            "number" &&
          Number.isFinite(
            item.valor
          )
      );

  const coincide = (
    informado,
    calculado
  ) => {
    const tolerancia =
      Math.max(
        0.000001,
        Math.abs(
          calculado
        ) *
          0.000001
      );

    return (
      Math.abs(
        informado -
          calculado
      ) <= tolerancia
    );
  };

  function validarDerivado(
    elemento,
    equipoId,
    ruta
  ) {
    if (
      !elemento ||
      elemento.origen !==
        "derivado"
    ) {
      return;
    }

    const derivacion =
      elemento.derivacion;

    if (
      !derivacion ||
      typeof derivacion !==
        "object"
    ) {
      inconsistencias.push({
        equipoId,

        motivo:
          "valor_derivado_sin_derivacion",

        ruta,

        nombre:
          elemento.nombre ||
          null,

        valorInformado:
          elemento.valor ??
          null,
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
      !Array.isArray(
        factores
      ) ||
      factores.length ===
        0
    ) {
      inconsistencias.push({
        equipoId,

        motivo:
          "derivacion_sin_factores",

        ruta,

        nombre:
          elemento.nombre ||
          null,
      });

      return;
    }

    if (
      !numericosValidos(
        factores
      )
    ) {
      inconsistencias.push({
        equipoId,

        motivo:
          "factor_derivacion_invalido",

        ruta,

        nombre:
          elemento.nombre ||
          null,

        factores,
      });

      return;
    }

    if (
      !numericosValidos(
        divisores
      ) ||
      divisores.some(
        (divisor) =>
          divisor.valor ===
          0
      )
    ) {
      inconsistencias.push({
        equipoId,

        motivo:
          "divisor_derivacion_invalido",

        ruta,

        nombre:
          elemento.nombre ||
          null,

        divisores,
      });

      return;
    }

    const calculado =
      calcular(
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
          elemento.nombre ||
          null,

        valorInformado:
          elemento.valor,

        valorCalculado:
          calculado,
      });

      return;
    }

    if (
      !coincide(
        elemento.valor,
        calculado
      )
    ) {
      inconsistencias.push({
        equipoId,

        motivo:
          "valor_derivado_no_coincide_con_operacion",

        ruta,

        nombre:
          elemento.nombre ||
          null,

        valorInformado:
          elemento.valor,

        valorCalculado:
          calculado,

        factores,

        divisores,
      });
    }

    for (
      const factor of
      factores
    ) {
      validarDerivado(
        factor,
        equipoId,
        `${ruta}.derivacion.factores`
      );
    }

    for (
      const divisor of
      divisores
    ) {
      validarDerivado(
        divisor,
        equipoId,
        `${ruta}.derivacion.divisores`
      );
    }
  }

  for (
    const equipo of
    resultado?.evaluacion_equipos ||
    []
  ) {
    const capacidad =
      equipo
        ?.capacidad_diaria;

    if (!capacidad) {
      continue;
    }

    const equipoId =
      equipo?.id ||
      null;

    for (
      const factor of
      capacidad.factores ||
      []
    ) {
      validarDerivado(
        factor,
        equipoId,
        "capacidad_diaria.factores"
      );
    }

    for (
      const divisor of
      capacidad.divisores ||
      []
    ) {
      validarDerivado(
        divisor,
        equipoId,
        "capacidad_diaria.divisores"
      );
    }

    // Si no se puede calcular capacidad,
    // null es un resultado válido.
    if (
      capacidad.valor ===
      null
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
      capacidad.factores
        .length === 0
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
      !numericosValidos(
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
      !numericosValidos(
        divisores
      ) ||
      divisores.some(
        (divisor) =>
          divisor.valor ===
          0
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

    const calculado =
      calcular(
        capacidad
          .factores
          .map(
            (factor) =>
              factor.valor
          ),

        divisores.map(
          (divisor) =>
            divisor.valor
        )
      );

    if (
      !coincide(
        capacidad.valor,
        calculado
      )
    ) {
      inconsistencias.push({
        equipoId,

        motivo:
          "capacidad_no_coincide_con_operacion",

        valorInformado:
          capacidad.valor,

        valorCalculado:
          calculado,

        factores:
          capacidad.factores,

        divisores,
      });
    }
  }

  return inconsistencias;
}

// -----------------------------------------------------------------------------
// VALIDACION DE ORIGEN: LOS DATOS "DE FICHA" TIENEN QUE ESTAR EN ESA FICHA
// -----------------------------------------------------------------------------
//
// El validador matemático comprueba que la cuenta esté bien hecha, pero no de
// dónde salieron los números. Si Prompt 5 usa para un equipo un valor de la
// ficha de OTRO equipo (por ejemplo, la capacidad por amasada de otra
// amasadora), la cuenta da bien y el error pasa inadvertido.
//
// Este control es genérico (no conoce máquinas ni nombres de campos):
// todo factor o divisor con origen "ficha" tiene que tener un valor que exista
// en la ficha de ESE MISMO equipo. Revisa también las derivaciones anidadas.
// -----------------------------------------------------------------------------

/** Todos los valores numéricos de una ficha (incluye los que vienen en listas). */
function valoresNumericosFicha(ficha) {
  const valores = [];

  for (const valor of Object.values(ficha?.valores || {})) {
    if (typeof valor === "number" && Number.isFinite(valor)) {
      valores.push(valor);
      continue;
    }

    if (Array.isArray(valor)) {
      for (const item of valor) {
        if (typeof item === "number" && Number.isFinite(item)) {
          valores.push(item);
        }
      }
    }
  }

  return valores;
}

function factoresDeFichaInexistentes(resultado, etapaCandidata) {
  // Valores numéricos de la ficha de cada equipo de esta etapa.
  const valoresPorEquipo = new Map();

  for (const opcion of etapaCandidata?.opciones || []) {
    for (const equipo of opcion?.equipos || []) {
      const id = String(equipo?.id || "").trim();

      if (id && !valoresPorEquipo.has(id)) {
        valoresPorEquipo.set(id, valoresNumericosFicha(equipo?.ficha));
      }
    }
  }

  const errores = [];

  const existeEnFicha = (valor, valores) =>
    typeof valor === "number" &&
    valores.some(
      (v) => Math.abs(v - valor) <= Math.max(0.000001, Math.abs(v) * 0.000001)
    );

  const revisar = (elemento, equipoId, ruta) => {
    if (!elemento || typeof elemento !== "object") {
      return;
    }

    if (
      elemento.origen === "ficha" &&
      !existeEnFicha(elemento.valor, valoresPorEquipo.get(equipoId) || [])
    ) {
      errores.push({
        equipoId,

        motivo: "factor_de_ficha_inexistente",

        ruta,

        nombre: elemento.nombre || null,

        valorInformado: elemento.valor ?? null,
      });
    }

    for (const factor of elemento?.derivacion?.factores || []) {
      revisar(factor, equipoId, `${ruta}.derivacion.factores`);
    }

    for (const divisor of elemento?.derivacion?.divisores || []) {
      revisar(divisor, equipoId, `${ruta}.derivacion.divisores`);
    }
  };

  for (const equipo of resultado?.evaluacion_equipos || []) {
    const equipoId = String(equipo?.id || "");

    for (const factor of equipo?.capacidad_diaria?.factores || []) {
      revisar(factor, equipoId, "capacidad_diaria.factores");
    }

    for (const divisor of equipo?.capacidad_diaria?.divisores || []) {
      revisar(divisor, equipoId, "capacidad_diaria.divisores");
    }
  }

  return errores;
}

// -----------------------------------------------------------------------------
// VALIDAR RESULTADO
// -----------------------------------------------------------------------------

function evaluarConsistenciaResultado(
  resultado
) {
  const errorValidacion =
    validarComparacionBasica(
      resultado
    );

  if (errorValidacion) {
    return {
      inconsistencia:
        "estructura_respuesta_invalida",

      errorValidacion,

      erroresCapacidad:
        [],
    };
  }

  const erroresCapacidad =
    inconsistenciasDeCapacidad(
      resultado
    );

  if (
    erroresCapacidad.length >
    0
  ) {
    return {
      inconsistencia:
        "capacidad_matematicamente_inconsistente",

      errorValidacion:
        null,

      erroresCapacidad,
    };
  }

  return {
    inconsistencia:
      null,

    errorValidacion:
      null,

    erroresCapacidad:
      [],
  };
}

// -----------------------------------------------------------------------------
// EJECUTAR PROMPT 5
// -----------------------------------------------------------------------------
const PROMPT5_RESPONSE_FORMAT = {
  type: "json_schema",

  json_schema: {
    name: "advisor_comparison_stage",

    strict: true,

    schema: {
      type: "object",

      additionalProperties: false,

        required: [
          "accion",
          "mensaje_cliente",
          "datos_obtenidos",
          "verificaciones_tecnicas",
          "evaluacion_equipos",
          "evaluacion_opciones",
          "seleccion",
        ],
      properties: {
        accion: {
          type: "string",
          enum: [
            "listo",
          ],
        },

        mensaje_cliente: {
          type: "null",
        },

        datos_obtenidos: {
          type: "array",

          items: {
            type: "object",

            additionalProperties: false,

            required: [
              "dato",
              "respuesta",
              "estado",
            ],

            properties: {
              dato: {
                type: "string",
              },

              respuesta: {
                anyOf: [
                  {
                    type: "string",
                  },
                  {
                    type: "number",
                  },
                  {
                    type: "boolean",
                  },
                  {
                    type: "null",
                  },
                ],
              },

              estado: {
                type: "string",

                enum: [
                  "confirmado",
                  "no_disponible",
                ],
              },
            },
          },
        },
        // -------------------------------------------------------------------------
// VERIFICACIONES TECNICAS
// -------------------------------------------------------------------------
//
// Son requisitos técnicos pendientes que NO bloquean la recomendación.
//
// Ejemplos posibles:
// - frecuencia eléctrica;
// - neutro;
// - potencia disponible;
// - presión;
// - caudal;
// - conexiones.
//
// El contenido lo decide Prompt 5.
// El schema solamente obliga a respetar la estructura.
// -------------------------------------------------------------------------

verificaciones_tecnicas: {
  type: "array",

  items: {
    type: "object",

    additionalProperties: false,

    required: [
      "equipo",
      "etapa",
      "dato",
      "motivo",
    ],

    properties: {
      equipo: {
        type: "string",
      },

      etapa: {
        type: "string",
      },

      dato: {
        type: "string",
      },

      motivo: {
        type: "string",
      },
    },
  },
},
        evaluacion_equipos: {
          type: "array",

          items: {
            type: "object",

            additionalProperties: false,

            required: [
              "id",
              "etapa",
              "marca",
              "capacidad_evaluable",
              "criterios",
              "capacidad_diaria",
              "volumen_a_cubrir",
              "resultado",
              "motivo",
            ],

            properties: {
              id: {
                type: "string",
              },

              etapa: {
                type: "string",
              },

              marca: {
                type: "string",
              },

              capacidad_evaluable: {
                type: "boolean",
              },

              criterios: {
                type: "array",

                items: {
                  type: "object",

                  additionalProperties: false,

                  required: [
                    "campo",
                    "condicion",
                    "aplicable",
                    "resultado",
                    "origen_no_confirmable",
                    "dato_faltante",
                    "puede_cambiar_resultado",
                    "detalle",
                  ],

                  properties: {
                    campo: {
                      type: "string",
                    },

                    condicion: {
                      type: "string",

                      enum: [
                        "a",
                        "b",
                        "c",
                      ],
                    },

                    aplicable: {
                      type: "boolean",
                    },

                    resultado: {
                      type: "string",

                      enum: [
                        "cumple",
                        "no_cumple",
                        "no_confirmable",
                      ],
                    },

                    origen_no_confirmable: {
                      anyOf: [
                        {
                          type: "string",

                          enum: [
                            "cliente",
                            "ficha",
                          ],
                        },
                        {
                          type: "null",
                        },
                      ],
                    },

                    dato_faltante: {
                      anyOf: [
                        {
                          type: "string",
                        },
                        {
                          type: "null",
                        },
                      ],
                    },

                    puede_cambiar_resultado: {
                      type: "boolean",
                    },

                    detalle: {
                      type: "string",
                    },
                  },
                },
              },

              capacidad_diaria: {
                $ref:
                  "#/$defs/capacidad_diaria",
              },

              volumen_a_cubrir: {
                type: "object",

                additionalProperties: false,

                required: [
                  "valor",
                  "unidad",
                ],

                properties: {
                  valor: {
                    anyOf: [
                      {
                        type: "number",
                      },
                      {
                        type: "null",
                      },
                    ],
                  },

                  unidad: {
                    type: "string",

                    enum: [
                      "kg de harina por día",
                    ],
                  },
                },
              },

              resultado: {
                type: "string",

                enum: [
                  "compatible",
                  "descartado",
                  "a_confirmar",
                ],
              },

              motivo: {
                anyOf: [
                  {
                    type: "string",
                  },
                  {
                    type: "null",
                  },
                ],
              },
            },
          },
        },

        evaluacion_opciones: {
          type: "array",

          items: {
            type: "object",

            additionalProperties: false,

            required: [
              "etapa",
              "ids",
              "tipo",
              "marca",
              "preferencia",
              "capacidad_diaria",
              "resultado",
              "motivo",
            ],

            properties: {
              etapa: {
                type: "string",
              },

              ids: {
                type: "array",

                items: {
                  type: "string",
                },
              },

              tipo: {
                type: "string",

                enum: [
                  "individual",
                  "conjunto",
                ],
              },

              marca: {
                type: "string",
              },

              preferencia: {
                type: "integer",
              },

              capacidad_diaria: {
                type: "object",

                additionalProperties: false,

                required: [
                  "valor",
                  "unidad",
                ],

                properties: {
                  valor: {
                    anyOf: [
                      {
                        type: "number",
                      },
                      {
                        type: "null",
                      },
                    ],
                  },

                  unidad: {
                    type: "string",

                    enum: [
                      "kg de harina por día",
                    ],
                  },
                },
              },

              resultado: {
                type: "string",

                enum: [
                  "compatible",
                  "descartado",
                  "a_confirmar",
                ],
              },

              motivo: {
                $ref:
                  "#/$defs/motivo_opcion",
              },
            },
          },
        },

        seleccion: {
          type: "array",

          items: {
            type: "object",

            additionalProperties: false,

            required: [
              "etapa",
              "recomendados",
              "alternativas_a_confirmar",
              "descartes_a_explicar",
              "sin_volumen",
              "sin_opciones",
              "motivo",
            ],

            properties: {
              etapa: {
                type: "string",
              },

              recomendados: {
                type: "array",

                items: {
                  $ref:
                    "#/$defs/opcion_seleccionada",
                },
              },

              alternativas_a_confirmar: {
                type: "array",

                items: {
                  $ref:
                    "#/$defs/opcion_seleccionada",
                },
              },

              descartes_a_explicar: {
                type: "array",

                items: {
                  type: "object",

                  additionalProperties: false,

                  required: [
                    "ids",
                    "motivo",
                  ],

                  properties: {
                    ids: {
                      type: "array",

                      items: {
                        type: "string",
                      },
                    },

                    motivo: {
                      $ref:
                        "#/$defs/motivo_opcion",
                    },
                  },
                },
              },

              sin_volumen: {
                type: "boolean",
              },

              sin_opciones: {
                type: "boolean",
              },

              motivo: {
                anyOf: [
                  {
                    type: "string",
                  },
                  {
                    type: "null",
                  },
                ],
              },
            },
          },
        },
      },

      $defs: {
        factor: {
          type: "object",

          additionalProperties: false,

          required: [
            "nombre",
            "valor",
            "origen",
            "derivacion",
          ],

          properties: {
            nombre: {
              type: "string",
            },

            valor: {
              type: "number",
            },

            origen: {
              type: "string",

              enum: [
                "ficha",
                "cliente",
                "derivado",
                "excel",
              ],
            },

            derivacion: {
              anyOf: [
                {
                  type: "null",
                },

                {
                  type: "object",

                  additionalProperties: false,

                  required: [
                    "factores",
                    "divisores",
                    "calculo",
                  ],

                  properties: {
                    factores: {
                      type: "array",

                      items: {
                        $ref:
                          "#/$defs/factor",
                      },
                    },

                    divisores: {
                      type: "array",

                      items: {
                        $ref:
                          "#/$defs/factor",
                      },
                    },

                    calculo: {
                      anyOf: [
                        {
                          type: "string",
                        },
                        {
                          type: "null",
                        },
                      ],
                    },
                  },
                },
              ],
            },
          },
        },

        capacidad_diaria: {
          type: "object",

          additionalProperties: false,

          required: [
            "valor",
            "unidad",
            "factores",
            "divisores",
            "calculo",
          ],

          properties: {
            valor: {
              anyOf: [
                {
                  type: "number",
                },
                {
                  type: "null",
                },
              ],
            },

            unidad: {
              type: "string",

              enum: [
                "kg de harina por día",
              ],
            },

            factores: {
              type: "array",

              items: {
                $ref:
                  "#/$defs/factor",
              },
            },

            divisores: {
              type: "array",

              items: {
                $ref:
                  "#/$defs/factor",
              },
            },

            calculo: {
              anyOf: [
                {
                  type: "string",
                },
                {
                  type: "null",
                },
              ],
            },
          },
        },

        motivo_detallado: {
          type: "object",

          additionalProperties: false,

          required: [
            "equipo",
            "criterio",
            "requisito_del_equipo",
            "dato_del_cliente",
            "explicacion",
          ],

          properties: {
            equipo: {
              anyOf: [
                {
                  type: "string",
                },
                {
                  type: "null",
                },
              ],
            },

            criterio: {
              anyOf: [
                {
                  type: "string",
                },
                {
                  type: "null",
                },
              ],
            },

            requisito_del_equipo: {
              anyOf: [
                {
                  type: "string",
                },
                {
                  type: "number",
                },
                {
                  type: "boolean",
                },
                {
                  type: "null",
                },
              ],
            },

            dato_del_cliente: {
              anyOf: [
                {
                  type: "string",
                },
                {
                  type: "number",
                },
                {
                  type: "boolean",
                },
                {
                  type: "null",
                },
              ],
            },

            explicacion: {
              type: "string",
            },
          },
        },

        motivo_opcion: {
          anyOf: [
            {
              type: "null",
            },
            {
              type: "string",
            },
            {
              $ref:
                "#/$defs/motivo_detallado",
            },
          ],
        },

        opcion_seleccionada: {
          type: "object",

          additionalProperties: false,

          required: [
            "ids",
            "marca",
          ],

          properties: {
            ids: {
              type: "array",

              items: {
                type: "string",
              },
            },

            marca: {
              type: "string",
            },
          },
        },
      },
    },
  },
};
// -----------------------------------------------------------------------------
// PRECIOS Y METRICAS DE PROMPT 5
// -----------------------------------------------------------------------------
//
// Estos valores se usan SOLO para mostrar un costo estimado en consola.
// No modifican la ejecución de Prompt 5.
//
// Precios estándar por 1 millón de tokens.
//
// GPT-5.1:
// - input:        USD 1.25
// - input cache:  USD 0.125
// - output:       USD 10.00
//
// GPT-5.6 Luna:
// - input:        USD 0.20
// - input cache:  USD 0.02
// - cache write:  USD 0.25
// - output:       USD 1.20
//
// IMPORTANTE:
// completion_tokens ya incluye los reasoning tokens facturables.
// Por eso NO se vuelven a sumar aparte al costo.
//

const PRECIOS_MODELOS = {
  "gpt-5.1": {
    input: 1.25,
    cachedInput: 0.125,
    cacheWrite: 1.25,
    output: 10.0,
  },

  "gpt-5.6-luna": {
    input: 0.2,
    cachedInput: 0.02,
    cacheWrite: 0.25,
    output: 1.2,
  },
    // GPT-6 Luna
  "gpt-6-luna": {
    input: 0.10,
    cachedInput: 0.01,
    cacheWrite: 0.125,
    output: 0.50,
  },
};


// -----------------------------------------------------------------------------
// OBTENER PRECIO SEGUN MODELO
// -----------------------------------------------------------------------------
//
// OpenAI puede devolver el nombre exacto del snapshot.
// Por ejemplo:
//
// gpt-5.1-2025-11-13
//
// Por eso no comparamos solamente igualdad exacta.
//

function obtenerPreciosModelo(
  modelo
) {
  const nombre =
    String(
      modelo || ""
    ).toLowerCase();
  if (
  nombre.startsWith(
    "gpt-6-luna"
  )
) {
  return PRECIOS_MODELOS[
    "gpt-6-luna"
  ];
}
  if (
    nombre.startsWith(
      "gpt-5.6-luna"
    )
  ) {
    return PRECIOS_MODELOS[
      "gpt-5.6-luna"
    ];
  }

  if (
    nombre.startsWith(
      "gpt-5.1"
    )
  ) {
    return PRECIOS_MODELOS[
      "gpt-5.1"
    ];
  }

  return null;
}


// -----------------------------------------------------------------------------
// CALCULAR METRICAS DE UNA LLAMADA
// -----------------------------------------------------------------------------

function calcularMetricasUso(
  completion,
  modeloSolicitado
) {
  const usage =
    completion?.usage || {};

  const promptTokens =
    Number(
      usage.prompt_tokens || 0
    );

  const completionTokens =
    Number(
      usage.completion_tokens || 0
    );

  const totalTokens =
    Number(
      usage.total_tokens || 0
    );

  // Tokens de entrada que OpenAI pudo reutilizar
  // desde Prompt Caching.
  const cachedTokens =
    Number(
      usage
        .prompt_tokens_details
        ?.cached_tokens || 0
    );

  // Algunos modelos/API pueden informar
  // además tokens escritos al cache.
  const cacheWriteTokens =
    Number(
      usage
        .prompt_tokens_details
        ?.cache_write_tokens || 0
    );

  // Los tokens restantes son input normal.
  const uncachedInputTokens =
    Math.max(
      0,
      promptTokens -
        cachedTokens -
        cacheWriteTokens
    );

  // Solo lo mostramos como información.
  // YA está contenido dentro de
  // completion_tokens.
  const reasoningTokens =
    Number(
      usage
        .completion_tokens_details
        ?.reasoning_tokens || 0
    );

  // Preferimos el modelo que informa
  // realmente OpenAI.
  const modeloReal =
    completion?.model ||
    modeloSolicitado ||
    "desconocido";

  const precios =
    obtenerPreciosModelo(
      modeloReal
    );

  let costoInputUsd =
    null;

  let costoCachedInputUsd =
    null;

  let costoCacheWriteUsd =
    null;

  let costoOutputUsd =
    null;

  let costoTotalUsd =
    null;

  if (precios) {
    costoInputUsd =
      (
        uncachedInputTokens /
        1_000_000
      ) *
      precios.input;

    costoCachedInputUsd =
      (
        cachedTokens /
        1_000_000
      ) *
      precios.cachedInput;

    costoCacheWriteUsd =
      (
        cacheWriteTokens /
        1_000_000
      ) *
      precios.cacheWrite;

    costoOutputUsd =
      (
        completionTokens /
        1_000_000
      ) *
      precios.output;

    costoTotalUsd =
      costoInputUsd +
      costoCachedInputUsd +
      costoCacheWriteUsd +
      costoOutputUsd;
  }

  return {
    modelo:
      modeloReal,

    serviceTier:
      completion?.service_tier ||
      null,

    inputTokens:
      promptTokens,

    inputNoCacheados:
      uncachedInputTokens,

    inputCacheados:
      cachedTokens,

    cacheWriteTokens,

    outputTokens:
      completionTokens,

    reasoningTokens,

    totalTokens,

    costoInputUsd,

    costoCachedInputUsd,

    costoCacheWriteUsd,

    costoOutputUsd,

    costoTotalUsd,
  };
}

async function ejecutarPrompt5(
  openai,
  prompt
) {
  // ---------------------------------------------------------------------------
  // MODELO
  // ---------------------------------------------------------------------------

  // ---------------------------------------------------------------------------
// MODELO DE PRUEBA PARA PROMPT 5
// ---------------------------------------------------------------------------
//
// Probamos GPT-6 Luna únicamente en la comparación.
// No afecta Prompt 1, 2, 3, 4 ni al resto del asesor.
//

const modelo =
  "gpt-6-luna";
  // ---------------------------------------------------------------------------
  // LLAMADA A OPENAI
  // ---------------------------------------------------------------------------

  const completion =
    await openai
      .chat
      .completions
      .create({
        model:
          modelo,
          ...opcionesRazonamiento("ADVISOR_COMPARISON_REASONING_EFFORT"),

        messages: [
          {
            role:
              "user",

            content:
              prompt,
          },
        ],

        response_format:
          PROMPT5_RESPONSE_FORMAT,
      });

  // ---------------------------------------------------------------------------
  // METRICAS DE USO
  // ---------------------------------------------------------------------------
  //
  // Calculamos las métricas inmediatamente después de recibir la respuesta.
  // Esta variable se mantiene disponible hasta el return de la función.
  //

  const metricasUso =
    calcularMetricasUso(
      completion,
      modelo
    );

  // ---------------------------------------------------------------------------
  // RESPUESTA
  // ---------------------------------------------------------------------------

  const mensaje =
    completion
      .choices?.[0]
      ?.message;

  if (
    mensaje?.refusal
  ) {
    throw new Error(
      `Prompt 5 rechazo la respuesta: ${mensaje.refusal}`
    );
  }

  const texto =
    mensaje
      ?.content
      ?.trim();

  if (!texto) {
    throw new Error(
      "Prompt 5 no devolvio contenido"
    );
  }

  // ---------------------------------------------------------------------------
  // PARSEAR JSON
  // ---------------------------------------------------------------------------

  let resultado;

  try {
    resultado =
      JSON.parse(
        texto
      );
  } catch {
    const error =
      new Error(
        "Prompt 5 devolvio un JSON invalido"
      );

    error.raw =
      texto;

    throw error;
  }

  // ---------------------------------------------------------------------------
  // DEVOLVER RESULTADO + METRICAS
  // ---------------------------------------------------------------------------

  return {
    resultado,
    metricasUso,
  };
}
// -----------------------------------------------------------------------------
// LOGS
// -----------------------------------------------------------------------------

function nombreEtapaParaLog(
  etapa,
  indice
) {
  return String(
    etapa?.etapa ||
      `ETAPA_${indice + 1}`
  )
    .normalize("NFD")
    .replace(
      /[\u0300-\u036f]/g,
      ""
    )
    .replace(
      /[^a-zA-Z0-9_-]+/g,
      "_"
    )
    .slice(
      0,
      80
    );
}

// -----------------------------------------------------------------------------
// COMBINAR datos_obtenidos
// -----------------------------------------------------------------------------

function combinarDatosObtenidos(
  resultadosEtapas,
  datosComparacionPrevios = []
) {
  const mapa =
    new Map();

  for (
    const dato of
    datosComparacionPrevios ||
    []
  ) {
    if (!dato?.dato) {
      continue;
    }

    mapa.set(
      String(
        dato.dato
      ).trim(),
      dato
    );
  }

  for (
    const item of
    resultadosEtapas ||
    []
  ) {
    for (
      const dato of
      item
        ?.resultado
        ?.datos_obtenidos ||
      []
    ) {
      if (!dato?.dato) {
        continue;
      }

      const clave =
        String(
          dato.dato
        ).trim();

      if (!clave) {
        continue;
      }

      const anterior =
        mapa.get(
          clave
        );

      if (!anterior) {
        mapa.set(
          clave,
          dato
        );

        continue;
      }

      if (
        dato?.estado ===
          "confirmado" &&
        anterior?.estado !==
          "confirmado"
      ) {
        mapa.set(
          clave,
          dato
        );
      }
    }
  }

  return [
    ...mapa.values(),
  ];
}
// -----------------------------------------------------------------------------
// COMBINAR VERIFICACIONES TECNICAS
// -----------------------------------------------------------------------------
//
// Prompt 5 corre una vez por etapa.
//
// Por eso cada etapa puede devolver sus propias verificaciones técnicas.
//
// Acá simplemente:
// - las juntamos;
// - evitamos duplicados exactos del mismo equipo + etapa + dato;
//
// NO interpretamos técnicamente el requisito.
// NO agregamos verificaciones.
// NO eliminamos verificaciones por criterio de negocio.
// -----------------------------------------------------------------------------

function combinarVerificacionesTecnicas(
  resultadosEtapas
) {
  const mapa = new Map();

  for (
    const item of
    resultadosEtapas || []
  ) {
    const verificaciones =
      item
        ?.resultado
        ?.verificaciones_tecnicas ||
      [];

    for (
      const verificacion of
      verificaciones
    ) {
      if (
        !verificacion?.equipo ||
        !verificacion?.etapa ||
        !verificacion?.dato
      ) {
        continue;
      }

      // La clave evita que la misma etapa devuelva dos veces
      // exactamente la misma verificación para un equipo.
      const clave = [
        String(
          verificacion.equipo
        ).trim(),

        String(
          verificacion.etapa
        ).trim(),

        String(
          verificacion.dato
        )
          .trim()
          .toLowerCase(),
      ].join("|");

      if (
        !mapa.has(clave)
      ) {
        mapa.set(
          clave,
          verificacion
        );
      }
    }
  }

  return [
    ...mapa.values(),
  ];
}
// -----------------------------------------------------------------------------
// COMBINAR ETAPAS
// -----------------------------------------------------------------------------

// -----------------------------------------------------------------------------
// COMBINAR ETAPAS
// -----------------------------------------------------------------------------
//
// Cada etapa fue evaluada independientemente por Prompt 5.
//
// Acá armamos una única comparación final.
//
// IMPORTANTE:
// - no recalculamos capacidades;
// - no modificamos resultados;
// - no reinterpretamos verificaciones técnicas;
// - solamente combinamos las respuestas de todas las etapas.
// -----------------------------------------------------------------------------

function combinarResultadosEtapas({
  resultadosEtapas,
  datosComparacionPrevios,
}) {
  return {
    // Ya no existe la fase de
    // repreguntas de comparación.
    accion:
      "listo",

    mensaje_cliente:
      null,

    // Datos del cliente ya resueltos durante
    // la comparación.
    datos_obtenidos:
      combinarDatosObtenidos(
        resultadosEtapas,
        datosComparacionPrevios
      ),

    // Requisitos técnicos pendientes que no
    // bloquearon la recomendación.
    verificaciones_tecnicas:
      combinarVerificacionesTecnicas(
        resultadosEtapas
      ),

    // Evaluaciones individuales de todos
    // los equipos de todas las etapas.
    evaluacion_equipos:
      resultadosEtapas.flatMap(
        (item) =>
          item
            ?.resultado
            ?.evaluacion_equipos ||
          []
      ),

    // Evaluaciones de opciones individuales
    // o conjuntos.
    evaluacion_opciones:
      resultadosEtapas.flatMap(
        (item) =>
          item
            ?.resultado
            ?.evaluacion_opciones ||
          []
      ),

    // Selección final de cada etapa.
    seleccion:
      resultadosEtapas.flatMap(
        (item) =>
          item
            ?.resultado
            ?.seleccion ||
          []
      ),
  };
}

// -----------------------------------------------------------------------------
// EJECUTAR UNA ETAPA
// -----------------------------------------------------------------------------
//
// UNA llamada de IA por etapa.
//
// SIN reintento.
// SIN reparación.
// SIN repreguntas.
//
// Las etapas corren después todas
// simultáneamente mediante Promise.all().
// -----------------------------------------------------------------------------

async function ejecutarComparacionEtapa({
  sessionId,
  openai,
  reglasComunes,
  registroCliente,
  datosComparacion,
  etapa,
  historial,
  indice,
}) {
  // ---------------------------------------------------------------------------
  // NOMBRE DE LA ETAPA PARA LOGS
  // ---------------------------------------------------------------------------

  const nombreEtapa =
    nombreEtapaParaLog(
      etapa,
      indice
    );

  // ---------------------------------------------------------------------------
  // PROMPT BASE
  // ---------------------------------------------------------------------------

  const promptBase =
    prompt5Comparacion({
      reglasComunes,

      registroCliente,

      datosComparacion,

      candidatos: [
        etapa,
      ],

      historial,

      // No hay repreguntas.
      maxPreguntasComparacion:
        0,
    });

  // ---------------------------------------------------------------------------
  // MODO SIN REPREGUNTAS
  // ---------------------------------------------------------------------------
  //
  // Cada llamada procesa solamente una etapa.
  //
  // Si falta información:
  // - no_confirmable
  // - a_confirmar
  // - continuar
  //
  // Nunca vuelve a preguntarle al cliente.
  //

  const promptEtapa =
    `
${promptBase}

======================================================================
MODO DE COMPARACION SIN REPREGUNTAS
======================================================================

Para esta ejecucion NO hagas preguntas al cliente.

Compara exclusivamente con la informacion disponible en:

- registro del cliente;
- datos de comparacion ya obtenidos;
- candidatos;
- fichas;
- esquemas.

Si falta cualquier dato del cliente o de la ficha:

- NO inventes el dato;
- NO pidas el dato;
- NO intentes repararlo;
- marca el criterio como "no_confirmable" cuando corresponda;
- deja el equipo u opcion como "a_confirmar" si ese faltante impide confirmar compatibilidad.

"a_confirmar" es un resultado FINAL valido de esta comparacion.

No es un error.
No requiere una nueva pregunta.
No requiere una nueva ejecucion.

La ausencia de un dato NO equivale a incompatibilidad.

Solo usa "descartado" cuando exista una incompatibilidad confirmada.

IMPORTANTE:

Aunque falten datos, devolve igualmente TODOS los campos obligatorios del JSON.

Para esta ejecucion:

"accion": "listo"
"mensaje_cliente": null

Responde unicamente el JSON final completo de ESTA etapa.
    `.trim();

  // ---------------------------------------------------------------------------
  // INICIO DE MEDICION
  // ---------------------------------------------------------------------------

  const inicio =
    Date.now();

  // ---------------------------------------------------------------------------
  // VARIABLES DE RESULTADO
  // ---------------------------------------------------------------------------
  //
  // MUY IMPORTANTE:
  //
  // Ambas variables se declaran FUERA del try.
  //
  // De esta manera siguen existiendo después del try y podemos utilizarlas
  // tanto en los logs como en el return de la función.
  //

  let resultado;
  let metricasUso;

  // ---------------------------------------------------------------------------
  // EJECUCION DE PROMPT 5
  // ---------------------------------------------------------------------------

  try {
    const ejecucion =
      await ejecutarPrompt5(
        openai,
        promptEtapa
      );

    // Resultado técnico de Prompt 5.
    resultado =
      ejecucion.resultado;

    // Tokens, modelo y costo de esta llamada.
    metricasUso =
      ejecucion.metricasUso;
  } catch (error) {
    const nuevoError =
      new Error(
        `Prompt 5 fallo en la etapa "${etapa?.etapa || nombreEtapa}": ${error.message}`
      );

    nuevoError.raw =
      error.raw;

    throw nuevoError;
  }

  // ---------------------------------------------------------------------------
  // DURACION
  // ---------------------------------------------------------------------------

  const duracionMs =
    Date.now() -
    inicio;

   console.log(
    `PROMPT5 ETAPA ${nombreEtapa}: ${duracionMs}ms`
  );

  registrarTiempo(
    sessionId,
    "Prompt 5 (una etapa)",
    inicio,
    etapa?.etapa || nombreEtapa
  );
  // ---------------------------------------------------------------------------
  // LOG DE CONSUMO
  // ---------------------------------------------------------------------------

  console.log(
    `PROMPT5 CONSUMO ${nombreEtapa}:`,
    {
      modelo:
        metricasUso?.modelo ||
        null,

      inputTokens:
        metricasUso?.inputTokens ||
        0,

      inputNoCacheados:
        metricasUso
          ?.inputNoCacheados ||
        0,

      inputCacheados:
        metricasUso
          ?.inputCacheados ||
        0,

      cacheWriteTokens:
        metricasUso
          ?.cacheWriteTokens ||
        0,

      outputTokens:
        metricasUso
          ?.outputTokens ||
        0,

      reasoningTokens:
        metricasUso
          ?.reasoningTokens ||
        0,

      totalTokens:
        metricasUso
          ?.totalTokens ||
        0,

      costoUsd:
        metricasUso
          ?.costoTotalUsd !=
        null
          ? Number(
              metricasUso
                .costoTotalUsd
                .toFixed(4)
            )
          : null,
    }
  );

  // ---------------------------------------------------------------------------
  // CAPACIDAD DE REFERENCIA DE ARGENTAL (sección 15B del Prompt 5)
  // ---------------------------------------------------------------------------
  //
  // Es un dato directo, no un cálculo. Si el modelo la marcó como "derivado"
  // sin derivación, se corrige el origen a "excel" para que el validador
  // matemático no la rechace. No cambia ningún valor ni resultado.
  //

  for (const equipo of resultado?.evaluacion_equipos || []) {
    for (const factor of equipo?.capacidad_diaria?.factores || []) {
      if (
        factor?.nombre === "capacidad_referencia_argental" &&
        factor.origen === "derivado" &&
        !factor.derivacion
      ) {
        factor.origen = "excel";

        console.log(
          `PROMPT5 ORIGEN CORREGIDO A "excel": ${equipo.id}`
        );
      }
    }
  }

  // ---------------------------------------------------------------------------
  // UNA SOLA VALIDACION
  // ---------------------------------------------------------------------------

  const control =
    evaluarConsistenciaResultado(
      resultado
    );

  if (
    control.inconsistencia
  ) {
    const error =
      new Error(
        `Prompt 5 devolvio una inconsistencia en la etapa "${etapa?.etapa || nombreEtapa}"`
      );

    error.detalleComparacion =
      {
        inconsistencia:
          control.inconsistencia,

        errorValidacion:
          control.errorValidacion,

        erroresCapacidad:
          control.erroresCapacidad,

        resultado,
      };

    throw error;
  }

  // ---------------------------------------------------------------------------
  // VALIDACION DE ORIGEN DE LOS DATOS DE FICHA
  // ---------------------------------------------------------------------------
  //
  // Cada número que Prompt 5 declara como "de ficha" tiene que existir en la
  // ficha de ese mismo equipo. Si no, mezcló datos de otra máquina.
  //

  const erroresFicha =
    factoresDeFichaInexistentes(
      resultado,
      etapa
    );

  if (
    erroresFicha.length > 0
  ) {
    const error =
      new Error(
        `Prompt 5 uso datos que no estan en la ficha del equipo en la etapa "${etapa?.etapa || nombreEtapa}"`
      );

    error.detalleComparacion =
      {
        inconsistencia:
          "factor_de_ficha_inexistente",

        errorValidacion:
          null,

        erroresCapacidad:
          erroresFicha,

        resultado,
      };

    throw error;
  }

  // ---------------------------------------------------------------------------
  // RESULTADO DE ESTA ETAPA
  // ---------------------------------------------------------------------------

  return {
    indice,

    etapa:
      etapa?.etapa ||
      null,

    resultado,

    duracionMs,

    metricasUso,
  };
}

// -----------------------------------------------------------------------------
// RUTA
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
      async (
        req,
        res
      ) => {
        const {
          sessionId,

          candidatos,

          historial,
        } =
          req.body ||
          {};

        // ---------------------------------------------------------------------
        // VALIDACIONES
        // ---------------------------------------------------------------------

        if (!openai) {
          return res
            .status(500)
            .json({
              ok: false,

              error:
                "OpenAI no esta configurado",
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

        if (
          !Array.isArray(
            candidatos
          ) ||
          candidatos.length ===
            0
        ) {
          return res
            .status(400)
            .json({
              ok: false,

              error:
                "Faltan candidatos",
            });
        }

        if (
          !Array.isArray(
            historial
          )
        ) {
          return res
            .status(400)
            .json({
              ok: false,

              error:
                "Falta historial",
            });
        }

        // ---------------------------------------------------------------------
        // SESION
        // ---------------------------------------------------------------------

        const sessionKey =
          `advisor:sesion:${sessionId}`;

        const sesionGuardada =
          await cacheGet(
            sessionKey
          );

        if (!sesionGuardada) {
          return res
            .status(404)
            .json({
              ok: false,

              error:
                "No existe la sesion del asesor",
            });
        }

        if (
          !sesionGuardada.registro
        ) {
          return res
            .status(400)
            .json({
              ok: false,

              error:
                "La sesion no tiene un diagnostico guardado",
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

        // ---------------------------------------------------------------------
        // ENRIQUECER CANDIDATOS
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
        // PROMPT 5 EN PARALELO
        // ---------------------------------------------------------------------
        //
        // Cada elemento de candidatosConEsquemas
        // representa una etapa.
        //
        // Todas empiezan simultáneamente.
        //

        const inicioPrompt5Paralelo =
          Date.now();

        let resultadosEtapas;

        try {
          resultadosEtapas =
            await Promise.all(
              candidatosConEsquemas.map(
                (
                  etapa,
                  indice
                ) =>
                  ejecutarComparacionEtapa(
                    {
                      sessionId,

                      openai,

                      reglasComunes,

                      registroCliente,

                      datosComparacion,

                      etapa,

                      historial,

                      indice,
                    }
                  )
              )
            );
} catch (error) {

  // ---------------------------------------------------------------------------
  // DEBUG: ERROR DE UNA ETAPA DE PROMPT 5
  // ---------------------------------------------------------------------------
  //
  // Si alguna de las etapas falla por validación, JSON, capacidad, etc.,
  // mostramos acá el motivo completo antes de devolver el 500.
  //

  console.error(
    "PROMPT5 ERROR ETAPA:",
    {
      mensaje:
        error.message,

      raw:
        error.raw ||
        null,

      detalleComparacion:
        error.detalleComparacion ||
        null,
    }
  );

  return res
    .status(500)
    .json({
      ok: false,

      error:
        error.message,

      raw:
        error.raw,

      detalleComparacion:
        error
          .detalleComparacion ||
        null,
    });
}
        const duracionPrompt5Paralelo =
          Date.now() -
          inicioPrompt5Paralelo;

                console.log(
          `PROMPT5 PARALELO TOTAL: ${duracionPrompt5Paralelo}ms`
        );

        registrarTiempo(
          sessionId,
          "Prompt 5 (todas las etapas)",
          inicioPrompt5Paralelo,
          `${candidatosConEsquemas.length} etapas en paralelo`
        );
        // -----------------------------------------------------------------------------
// RESUMEN DE CONSUMO POR ETAPA
// -----------------------------------------------------------------------------

const resumenConsumo =
  resultadosEtapas.map(
    (item) => {
      const uso =
        item.metricasUso ||
        {};

      return {
        etapa:
          item.etapa,

        modelo:
          uso.modelo ||
          null,

        input:
          uso.inputTokens ||
          0,

        inputNoCacheados:
          uso.inputNoCacheados ||
          0,

        cache:
          uso.inputCacheados ||
          0,

        output:
          uso.outputTokens ||
          0,

        reasoning:
          uso.reasoningTokens ||
          0,

        total:
          uso.totalTokens ||
          0,

        costoUsd:
          uso.costoTotalUsd !=
          null
            ? Number(
                uso
                  .costoTotalUsd
                  .toFixed(4)
              )
            : null,
      };
    }
  );

// -----------------------------------------------------------------------------
// TOTAL DE PROMPT 5
// -----------------------------------------------------------------------------

const consumoTotal =
  resultadosEtapas.reduce(
    (
      acumulado,
      item
    ) => {
      const uso =
        item.metricasUso ||
        {};

      acumulado.input +=
        uso.inputTokens ||
        0;

      acumulado.inputNoCacheados +=
        uso.inputNoCacheados ||
        0;

      acumulado.cache +=
        uso.inputCacheados ||
        0;

      acumulado.output +=
        uso.outputTokens ||
        0;

      acumulado.reasoning +=
        uso.reasoningTokens ||
        0;

      acumulado.total +=
        uso.totalTokens ||
        0;

      acumulado.costoUsd +=
        uso.costoTotalUsd ||
        0;

      return acumulado;
    },
    {
      input: 0,
      inputNoCacheados: 0,
      cache: 0,
      output: 0,
      reasoning: 0,
      total: 0,
      costoUsd: 0,
    }
  );

// -----------------------------------------------------------------------------
// MOSTRAR RESULTADOS
// -----------------------------------------------------------------------------

console.log(
  "\n================ PROMPT 5 - CONSUMO POR ETAPA ================"
);

console.table(
  resumenConsumo
);

console.log(
  "PROMPT5 CONSUMO TOTAL:",
  {
    inputTokens:
      consumoTotal.input,

    inputNoCacheados:
      consumoTotal
        .inputNoCacheados,

    inputCacheados:
      consumoTotal.cache,

    outputTokens:
      consumoTotal.output,

    reasoningTokens:
      consumoTotal.reasoning,

    totalTokens:
      consumoTotal.total,

    costoEstimadoUsd:
      Number(
        consumoTotal
          .costoUsd
          .toFixed(4)
      ),
  }
);

console.log(
  "==============================================================\n"
);
        for (
          const item of
          resultadosEtapas
        ) {
          console.log(
            "PROMPT5 RESULTADO ETAPA:",
            {
              etapa:
                item.etapa,

              duracionMs:
                item.duracionMs,
            }
          );
        }

        // ---------------------------------------------------------------------
        // UNIR TODAS LAS ETAPAS
        // ---------------------------------------------------------------------

        const resultado =
          combinarResultadosEtapas({
            resultadosEtapas,

            datosComparacionPrevios:
              datosComparacion,
          });

        // ---------------------------------------------------------------------
        // VALIDACIÓN GLOBAL
        // ---------------------------------------------------------------------

        const controlGlobal =
          evaluarConsistenciaResultado(
            resultado
          );

        if (
          controlGlobal.inconsistencia
        ) {
            // ---------------------------------------------------------------------------
  // DEBUG: ERROR DE VALIDACION GLOBAL
  // ---------------------------------------------------------------------------
  //
  // Este log se ejecuta si las etapas individualmente pasaron,
  // pero al unirlas aparece una inconsistencia global.
  //

  console.error(
    "PROMPT5 ERROR VALIDACION GLOBAL:",
    {
      inconsistencia:
        controlGlobal
          .inconsistencia,

      errorValidacion:
        controlGlobal
          .errorValidacion,

      erroresCapacidad:
        controlGlobal
          .erroresCapacidad,
    }
  );

          return res
            .status(500)
            .json({
              ok: false,

              error:
                "La comparacion por etapas quedo inconsistente despues de combinar los resultados",

              inconsistencia:
                controlGlobal
                  .inconsistencia,

              errorValidacion:
                controlGlobal
                  .errorValidacion,

              erroresCapacidad:
                controlGlobal
                  .erroresCapacidad,

              resultado,
            });
        }

        // ---------------------------------------------------------------------
        // VALIDAR IDs
        // ---------------------------------------------------------------------

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
              !permitidos.has(
                id
              )
          );

        if (
          invalidos.length >
          0
        ) {
          return res
            .status(500)
            .json({
              ok: false,

              error:
                "Prompt 5 selecciono IDs que no existen entre los candidatos",

              idsInvalidos: [
                ...new Set(
                  invalidos
                ),
              ],
            });
        }
        // ---------------------------------------------------------------------
// VALIDAR IDs DE VERIFICACIONES TECNICAS
// ---------------------------------------------------------------------
//
// Las verificaciones también deben apuntar exclusivamente a equipos
// que existían realmente entre los candidatos.
//
// Esto evita que el modelo genere una verificación para un ID inexistente.
// ---------------------------------------------------------------------

const idsConVerificacion =
  idsVerificacionesTecnicas(
    resultado
  );

const verificacionesInvalidas =
  idsConVerificacion.filter(
    (id) =>
      !permitidos.has(
        id
      )
  );

if (
  verificacionesInvalidas.length >
  0
) {
  return res
    .status(500)
    .json({
      ok: false,

      error:
        "Prompt 5 genero verificaciones tecnicas para IDs que no existen entre los candidatos",

      idsInvalidos: [
        ...new Set(
          verificacionesInvalidas
        ),
      ],
    });
}
        // ---------------------------------------------------------------------
        // GUARDAR SESION
        // ---------------------------------------------------------------------

        const nuevaSesion =
          {
            ...sesionGuardada,

            datosComparacion:
              resultado
                .datos_obtenidos,

            // Ya no existen preguntas
            // de comparación.
            preguntasComparacionRealizadas:
              0,

            preguntaComparacionPendiente:
              null,

            comparacion: {
            // Requisitos técnicos que deberán revisarse
            // posteriormente y que no bloquearon la recomendación.
            verificaciones_tecnicas:
              resultado
                .verificaciones_tecnicas,

            // Evaluación individual de equipos.
            evaluacion_equipos:
              resultado
                .evaluacion_equipos,

            // Evaluación de opciones.
            evaluacion_opciones:
              resultado
                .evaluacion_opciones,

            // Selección final por etapa.
            seleccion:
              resultado
                .seleccion,
          },

            actualizadoEn:
              new Date()
                .toISOString(),
          };

        await cacheSet(
          sessionKey,
          nuevaSesion,
          SESION_TTL_SEGUNDOS
        );

        // ---------------------------------------------------------------------
        // RESPUESTA
        // ---------------------------------------------------------------------

        return res.json({
          ok: true,

          sessionId,

          // La comparación siempre
          // termina en esta ejecución.
          accion:
            "listo",

          mensajeCliente:
            null,

          datosComparacion:
            resultado
              .datos_obtenidos,
          // Requisitos técnicos que no bloquearon
          // la recomendación y deberán verificarse
          // posteriormente.
          verificacionesTecnicas:
            resultado.verificaciones_tecnicas,
          evaluacionEquipos:
            resultado
              .evaluacion_equipos,

          evaluacionOpciones:
            resultado
              .evaluacion_opciones,

          seleccion:
            resultado
              .seleccion,

          // Se mantiene temporalmente
          // para no romper frontend/debug.
          reintentoComparacion:
            false,

          tiempoPrompt5ParaleloMs:
            duracionPrompt5Paralelo,

          tiemposEtapas:
            resultadosEtapas.map(
              (item) => ({
                etapa:
                  item.etapa,

                duracionMs:
                  item.duracionMs,
              })
            ),

          preguntasComparacionRealizadas:
            0,

          preguntaComparacionPendiente:
            null,
        });
      }
    )
  );
}