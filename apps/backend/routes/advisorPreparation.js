// =============================================================================
// Asesor Integral — Preparación de documentación
//
// Esta capa reutiliza la lectura de Drive existente del backend.
// No interpreta documentos y no usa IA.
//
// Su responsabilidad es:
// - recibir una o más carpetas de Drive;
// - obtener el manifest actual;
// - leer cada archivo usando readFileSmart;
// - devolver una lista normalizada de documentos.
//
// Más adelante esta documentación alimentará:
// - Prompt 1: esquema del tipo de equipo.
// - Prompt 2: ficha de cada máquina.
// =============================================================================
import { prompt1Esquema } from "../advisor/prompt/prompt1Esquema.js";
const MIME_FOLDER = "application/vnd.google-apps.folder";

/**
 * Lee la documentación contenida en una lista de carpetas de Drive.
 *
 * Importante:
 * - reutiliza getManifest() y readFileSmart() del backend;
 * - readFileSmart ya maneja caché y cambios por etag;
 * - no interpreta el contenido;
 * - no llama a OpenAI.
 */
export async function leerDocumentacionCarpetas(folderIds, deps) {
  const { getManifest, readFileSmart } = deps;

  if (!Array.isArray(folderIds) || folderIds.length === 0) {
    return {
      documentos: [],
      avisos: [],
    };
  }

  const documentosPorId = new Map();
  const avisos = [];

  for (const folderId of folderIds) {
    try {
      const manifest = await getManifest(folderId);

      for (const archivo of manifest.files || []) {
        // Por ahora trabajamos con archivos directamente dentro de cada
        // driveFolder. No intentamos leer subcarpetas como documentos.
        if (archivo.mimeType === MIME_FOLDER) {
          avisos.push({
            codigo: "subcarpeta_ignorada",
            mensaje: `Se ignoró la subcarpeta "${archivo.name}".`,
            folderId,
            fileId: archivo.id,
          });
          continue;
        }

        try {
          const leido = await readFileSmart(archivo);

          const fileId = leido.fileId || leido.id || archivo.id;

          // Si un mismo archivo aparece repetido por algún motivo,
          // conservamos una sola copia.
          if (documentosPorId.has(fileId)) continue;

          documentosPorId.set(fileId, {
            id: fileId,
            nombre: leido.name || archivo.name || "",
            mimeType: leido.mimeType || archivo.mimeType || null,
            etag: leido.etag || archivo.etag || null,
            folderId,
            contenido:
              typeof leido.content === "string"
                ? leido.content
                : "",
          });
        } catch (error) {
          avisos.push({
            codigo: "archivo_no_legible",
            mensaje: `No se pudo leer "${archivo.name}".`,
            folderId,
            fileId: archivo.id,
            detalle: error?.message || String(error),
          });
        }
      }
    } catch (error) {
      avisos.push({
        codigo: "carpeta_no_legible",
        mensaje: `No se pudo leer la carpeta ${folderId}.`,
        folderId,
        detalle: error?.message || String(error),
      });
    }
  }

  const documentos = Array.from(documentosPorId.values());

  return {
    documentos,
    avisos,
  };
}

/**
 * Registra endpoints temporales/de soporte para la preparación.
 *
 * Este endpoint nos permite probar la lectura documental antes de
 * conectar Prompt 1 y Prompt 2.
 */
export function registerAdvisorPreparationRoutes(app, deps) {
  const {
    openai,
    getManifest,
    readFileSmart,
    cacheGet,
    cacheSet,
    withTimer,
    asyncHandler,
  } = deps;

  // ============================================================
  // Leer documentos
  // ============================================================

  app.post(
    "/advisor/preparation/documents",
    withTimer(
      "advisorPreparationDocuments",
      asyncHandler(async (req, res) => {
        const { folderIds } = req.body || {};

        if (!Array.isArray(folderIds) || folderIds.length === 0) {
          return res.status(400).json({
            error: "Se requiere body { folderIds: string[] }",
          });
        }

        const resultado = await leerDocumentacionCarpetas(
          folderIds,
          {
            getManifest,
            readFileSmart,
          }
        );

        return res.status(200).json(resultado);
      })
    )
  );

  // ============================================================
  // Prompt 1 — Generar esquema por tipo
  // ============================================================

  app.post(
    "/advisor/preparation/schema",
    withTimer(
      "advisorPreparationSchema",
      asyncHandler(async (req, res) => {
        const {
          tipoEquipo,
          maquinas,
          force = false,
        } = req.body || {};

        if (!tipoEquipo || typeof tipoEquipo !== "string") {
          return res.status(400).json({
            error: "Falta tipoEquipo.",
          });
        }

        if (!Array.isArray(maquinas) || maquinas.length === 0) {
          return res.status(400).json({
            error:
              "Se requiere maquinas: [{ idBusquetti, nombreModelo, driveFolders }]",
          });
        }

        const resultado = await generarEsquemaTipo({
          tipoEquipo,
          maquinas,
          openai,
          getManifest,
          readFileSmart,
          cacheGet,
          cacheSet,
          force: Boolean(force),
        });

        return res.status(200).json(resultado);
      })
    )
  );
}
export async function generarEsquemaTipo({
  tipoEquipo,
  maquinas,
  openai,
  getManifest,
  readFileSmart,
  cacheGet,
  cacheSet,
  force = false,
}) {
  if (!openai) {
    throw new Error("OPENAI_API_KEY no está configurada.");
  }

  if (!tipoEquipo || typeof tipoEquipo !== "string") {
    throw new Error("Falta tipoEquipo.");
  }

  if (!Array.isArray(maquinas) || maquinas.length === 0) {
    throw new Error(
      `No se recibieron máquinas para el tipo "${tipoEquipo}".`
    );
  }

  const key = `advisor:esquema:${tipoEquipo.trim()}`;

  // 1. Si ya existe el esquema, reutilizarlo.
  if (!force) {
    const existente = await cacheGet(key);

    if (existente) {
      return {
        fromCache: true,
        key,
        esquema: existente,
        avisos: [],
      };
    }
  }

  // 2. Leer documentación de todas las máquinas del tipo.
  const maquinasConDocumentos = [];
  const avisos = [];

  for (const maquina of maquinas) {
    if (
      !maquina ||
      !maquina.idBusquetti ||
      !Array.isArray(maquina.driveFolders)
    ) {
      avisos.push({
        codigo: "maquina_invalida",
        mensaje:
          "Se recibió una máquina sin idBusquetti o driveFolders.",
      });

      continue;
    }

    const resultado = await leerDocumentacionCarpetas(
      maquina.driveFolders,
      {
        getManifest,
        readFileSmart,
      }
    );

    avisos.push(
      ...resultado.avisos.map((aviso) => ({
        ...aviso,
        idBusquetti: maquina.idBusquetti,
      }))
    );

    if (resultado.documentos.length === 0) {
      avisos.push({
        codigo: "maquina_sin_documentacion",
        mensaje:
          `La máquina "${maquina.nombreModelo}" ` +
          `(${maquina.idBusquetti}) no tiene documentación legible.`,
        idBusquetti: maquina.idBusquetti,
      });

      continue;
    }

    maquinasConDocumentos.push({
      idBusquetti: maquina.idBusquetti,
      nombreModelo:
        maquina.nombreModelo || maquina.idBusquetti,
      documentos: resultado.documentos,
    });
  }

  if (maquinasConDocumentos.length === 0) {
    throw new Error(
      `No hay documentación utilizable para el tipo "${tipoEquipo}".`
    );
  }

  // 3. Armar {{documentos_del_tipo}}
  const bloquesDocumentacion = [];

  for (const maquina of maquinasConDocumentos) {
    bloquesDocumentacion.push(
      [
        "============================================================",
        `MODELO: ${maquina.nombreModelo}`,
        `ID BUSQUETTI: ${maquina.idBusquetti}`,
        "============================================================",
      ].join("\n")
    );

    for (const documento of maquina.documentos) {
      bloquesDocumentacion.push(
        [
          `--- ARCHIVO: ${documento.nombre} ---`,
          documento.contenido,
          `--- FIN ARCHIVO: ${documento.nombre} ---`,
        ].join("\n")
      );
    }
  }

  const documentosDelTipo =
    bloquesDocumentacion.join("\n\n");

  // 4. Construir el Prompt 1 real.
  const prompt = prompt1Esquema({
    tipoEquipo,
    documentosDelTipo,
  });

  console.log(
    "[advisor/preparation/schema] ejecutando Prompt 1",
    {
      tipoEquipo,
      maquinas: maquinasConDocumentos.length,
      documentos: maquinasConDocumentos.reduce(
        (total, maquina) =>
          total + maquina.documentos.length,
        0
      ),
      promptChars: prompt.length,
    }
  );

  // 5. Ejecutar Prompt 1.
  const completion =
    await openai.chat.completions.create({
      model:
        process.env.ADVISOR_PREPARATION_MODEL ||
        "gpt-5.1",

      stream: false,

      response_format: {
        type: "json_object",
      },

      messages: [
        {
          role: "system",
          content: prompt,
        },
      ],
    });

  const contenido =
    completion.choices?.[0]?.message?.content?.trim();

  if (!contenido) {
    throw new Error(
      "Prompt 1 no devolvió contenido."
    );
  }

  // 6. Convertir respuesta de IA a JSON.
  let esquema;

  try {
    esquema = JSON.parse(contenido);
  } catch (error) {
    console.error(
      "[advisor/preparation/schema] JSON inválido:",
      contenido
    );

    throw new Error(
      `Prompt 1 devolvió JSON inválido: ${error.message}`
    );
  }

  // 7. Validaciones básicas.
  if (!esquema || typeof esquema !== "object") {
    throw new Error(
      "Prompt 1 no devolvió un objeto JSON."
    );
  }

  if (!Array.isArray(esquema.campos)) {
    throw new Error(
      'Prompt 1 no devolvió "campos" como array.'
    );
  }

  for (const campo of esquema.campos) {
    if (!campo.nombre) {
      throw new Error(
        "Prompt 1 devolvió un campo sin nombre."
      );
    }

    if (
      !["numero", "texto", "si_no", "lista"].includes(
        campo.tipo
      )
    ) {
      throw new Error(
        `Tipo inválido en el campo "${campo.nombre}": ${campo.tipo}`
      );
    }

    if (
      !["a", "b", "c"].includes(campo.condicion)
    ) {
      throw new Error(
        `Condición inválida en "${campo.nombre}": ${campo.condicion}`
      );
    }
  }

  // El nombre del tipo lo controla el código, no la IA.
  esquema.tipo = tipoEquipo;

  // 8. Guardar el esquema para reutilizarlo después.
  await cacheSet(key, esquema, 0);

  console.log(
    "[advisor/preparation/schema] esquema generado",
    {
      key,
      campos: esquema.campos.length,
    }
  );

  return {
    fromCache: false,
    key,
    esquema,
    avisos,
  };
}