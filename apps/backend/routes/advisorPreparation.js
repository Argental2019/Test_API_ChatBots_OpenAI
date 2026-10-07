// =============================================================================
// Asesor Integral — Preparación de documentación
//
// Esta capa reutiliza la lectura de Drive existente del backend.
//
// Su responsabilidad es:
// - recibir una o más carpetas de Drive;
// - obtener el manifest actual;
// - leer cada archivo usando readFileSmart;
// - devolver una lista normalizada de documentos;
// - generar el esquema de cada tipo de equipo (Prompt 1);
// - generar y mantener actualizada la ficha de cada máquina (Prompt 2).
//
// Actualización de fichas (misma lógica que smartRead):
// cada ficha se guarda con la "huella" de las carpetas de Drive con las que se
// generó (los etags de sus archivos) y con la versión del esquema de su tipo.
// Cuando la conversación pide una ficha, se compara la huella actual de Drive:
// - si no cambió, se usa la ficha guardada;
// - si cambió, se devuelve la ficha anterior y se regenera en segundo plano;
// - si no existe, se genera en el momento.
// =============================================================================
import crypto from "crypto";
import { prompt1Esquema } from "../advisor/prompt/prompt1Esquema.js";
import { prompt2Ficha, esquemaComoTexto } from "../advisor/prompt/prompt2Ficha.js";

const MIME_FOLDER = "application/vnd.google-apps.folder";

// Claves de Redis del asesor.
const CLAVE_ESQUEMA = (tipoEquipo) => `advisor:esquema:${tipoEquipo.trim()}`;
const CLAVE_FICHA = (idBusquetti) => `advisor:ficha:${idBusquetti}`;
const CLAVE_BLOQUEO = (idBusquetti) => `advisor:bloqueo:ficha:${idBusquetti}`;

// Tiempo máximo que una regeneración en curso bloquea a las demás (por si se corta).
const BLOQUEO_SEGUNDOS = 600;

// Cuántas máquinas se revisan en paralelo al pedir fichas.
const CONCURRENCIA_FICHAS = 4;

const ESTADOS_FICHA = ["documentado", "convertido", "derivado", "no_documentado", "ambiguo"];

const md5 = (texto) => crypto.createHash("md5").update(texto).digest("hex");

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

// =============================================================================
// Huella de carpetas y versión de esquema
// =============================================================================

/**
 * Huella de un conjunto de carpetas: un hash de "idArchivo:etag" de todos sus
 * archivos, ordenados. Si se agrega, quita o modifica un archivo, la huella
 * cambia. Usa getManifest(), igual que smartRead, así los etags se calculan
 * siempre de la misma forma.
 */
export async function calcularHuellaCarpetas(folderIds, getManifest) {
  const archivos = [];
  for (const folderId of folderIds) {
    const manifest = await getManifest(folderId);
    for (const archivo of manifest.files || []) {
      if (archivo.mimeType === MIME_FOLDER) continue;
      archivos.push(`${archivo.id}:${archivo.etag}`);
    }
  }
  archivos.sort();
  return md5(archivos.join("|"));
}

/**
 * Versión de un esquema: un hash de sus campos (nombre, tipo, unidad y
 * descripción). Si el esquema se regenera y cambia algún campo, cambia la
 * versión, y las fichas generadas con la versión anterior quedan desactualizadas.
 */
export function versionDeEsquema(esquema) {
  const campos = (esquema?.campos || []).map((c) => [c.nombre, c.tipo, c.unidad ?? null, c.descripcion ?? ""]);
  return md5(JSON.stringify(campos));
}

// =============================================================================
// Formato de respuesta y validación de la ficha (Prompt 2)
// =============================================================================

/** Tipo JSON de cada tipo de campo del esquema. Todos admiten null. */
const TIPO_JSON = {
  numero: { type: ["number", "null"] },
  texto: { type: ["string", "null"] },
  si_no: { type: ["boolean", "null"] },
  lista: { type: ["array", "null"], items: { anyOf: [{ type: "string" }, { type: "number" }] } },
};

/**
 * Arma el formato de respuesta estricto a partir del esquema del tipo:
 * la IA solo puede devolver exactamente esos campos, con esos tipos.
 */
export function armarFormatoRespuestaFicha(esquema) {
  const campos = esquema.campos || [];
  const nombres = campos.map((c) => c.nombre);
  const objeto = (propiedadDe) => ({
    type: "object",
    properties: Object.fromEntries(campos.map((c) => [c.nombre, propiedadDe(c)])),
    required: nombres,
    additionalProperties: false,
  });

  return {
    type: "json_schema",
    json_schema: {
      name: "ficha_maquina",
      strict: true,
      schema: {
        type: "object",
        properties: {
          id: { type: "string" },
          modelo: { type: "string" },
          valores: objeto((c) => TIPO_JSON[c.tipo] || TIPO_JSON.texto),
          estados: objeto(() => ({ type: "string", enum: ESTADOS_FICHA })),
          detalles: objeto(() => ({ type: ["string", "null"] })),
          fuentes: objeto(() => ({ type: ["string", "null"] })),
        },
        required: ["id", "modelo", "valores", "estados", "detalles", "fuentes"],
        additionalProperties: false,
      },
    },
  };
}

/** ¿El valor coincide con el tipo del campo? */
function valorValido(valor, tipo) {
  switch (tipo) {
    case "numero":
      return typeof valor === "number" && Number.isFinite(valor);
    case "texto":
      return typeof valor === "string" && valor.trim() !== "";
    case "si_no":
      return typeof valor === "boolean";
    case "lista":
      return Array.isArray(valor) && valor.length > 0 && valor.every((v) => typeof v === "string" || typeof v === "number");
    default:
      return false;
  }
}

/**
 * Valida la respuesta de la IA contra el esquema y la normaliza.
 * Ante una inconsistencia, se queda con la opción conservadora (dato en null)
 * y lo registra como aviso, para no guardar nunca un valor dudoso.
 */
export function validarFicha(crudo, esquema, maquina, tipoEquipo) {
  const avisos = [];
  const valores = {};
  const estados = {};
  const detalles = {};
  const fuentes = {};
  const aviso = (campo, mensaje) => avisos.push({ codigo: "ficha_corregida", campo, mensaje });

  for (const campo of esquema.campos || []) {
    const n = campo.nombre;
    let valor = crudo?.valores?.[n] ?? null;
    let estado = crudo?.estados?.[n];
    let detalle = typeof crudo?.detalles?.[n] === "string" ? crudo.detalles[n] : null;
    let fuente = typeof crudo?.fuentes?.[n] === "string" ? crudo.fuentes[n] : null;

    if (valor !== null && !valorValido(valor, campo.tipo)) {
      aviso(n, `El valor no coincide con el tipo "${campo.tipo}"; se descarta.`);
      valor = null;
      estado = "ambiguo";
      detalle = "Valor descartado: no coincide con el tipo del campo.";
    }

    if (!ESTADOS_FICHA.includes(estado)) {
      aviso(n, "Estado faltante o inválido; se asigna según el valor.");
      estado = valor === null ? "no_documentado" : "documentado";
    }

    if (valor !== null && (estado === "no_documentado" || estado === "ambiguo")) {
      aviso(n, `Tenía valor con estado "${estado}"; se deja en null.`);
      valor = null;
    }

    if (valor === null && ["documentado", "convertido", "derivado"].includes(estado)) {
      aviso(n, `Tenía estado "${estado}" sin valor; se pasa a "no_documentado".`);
      estado = "no_documentado";
    }

    if (valor === null) fuente = null;
    if (!["convertido", "derivado", "ambiguo"].includes(estado)) detalle = null;

    valores[n] = valor;
    estados[n] = estado;
    detalles[n] = detalle;
    fuentes[n] = fuente;
  }

  return {
    ficha: {
      id: maquina.idBusquetti,
      modelo: maquina.nombreModelo || maquina.idBusquetti,
      tipoEquipo,
      valores,
      estados,
      detalles,
      fuentes,
    },
    avisos,
  };
}

/**
 * Llama a OpenAI pidiendo JSON con el formato estricto. Si el modelo no
 * aceptara ese formato, reintenta pidiendo JSON simple: la validación del
 * código garantiza igual que la ficha respete el esquema.
 */
async function ejecutarPromptJson(openai, prompt, formato, avisos) {
  const modelo = process.env.ADVISOR_PREPARATION_MODEL || "gpt-5.1";
  const pedir = (response_format) =>
    openai.chat.completions.create({
      model: modelo,
      stream: false,
      response_format,
      messages: [{ role: "system", content: prompt }],
    });

  let completion;
  try {
    completion = await pedir(formato);
  } catch (error) {
    if (error?.status !== 400) throw error;
    avisos.push({ codigo: "formato_estricto_rechazado", mensaje: "El modelo rechazó el formato estricto; se usó JSON simple.", detalle: error.message });
    completion = await pedir({ type: "json_object" });
  }

  const contenido = completion.choices?.[0]?.message?.content?.trim();
  if (!contenido) throw new Error("La IA no devolvió contenido.");

  try {
    return JSON.parse(contenido);
  } catch (error) {
    console.error("[advisor/preparation] JSON inválido:", contenido);
    throw new Error(`La IA devolvió JSON inválido: ${error.message}`);
  }
}

// =============================================================================
// Prompt 2 — Generar ficha de una máquina
// =============================================================================

export async function generarFichaMaquina({
  maquina,
  tipoEquipo,
  openai,
  getManifest,
  readFileSmart,
  cacheGet,
  cacheSet,
}) {
  if (!openai) throw new Error("OPENAI_API_KEY no está configurada.");
  if (!tipoEquipo || typeof tipoEquipo !== "string") throw new Error("Falta tipoEquipo.");
  if (!maquina?.idBusquetti || !Array.isArray(maquina.driveFolders) || maquina.driveFolders.length === 0) {
    throw new Error("Se requiere maquina: { idBusquetti, nombreModelo, driveFolders }.");
  }

  // 1. El esquema del tipo tiene que existir (Prompt 1).
  const esquema = await cacheGet(CLAVE_ESQUEMA(tipoEquipo));
  if (!esquema || !Array.isArray(esquema.campos)) {
    throw new Error(`No existe el esquema del tipo "${tipoEquipo}". Hay que generarlo primero.`);
  }
  const versionEsquema = esquema.version || versionDeEsquema(esquema);

  // 2. Huella de Drive ANTES de leer: si alguien cambia un archivo mientras se
  //    genera, la ficha queda con la huella vieja y se regenera la próxima vez.
  const huella = await calcularHuellaCarpetas(maquina.driveFolders, getManifest);

  // 3. Documentación de la máquina.
  const { documentos, avisos: avisosLectura } = await leerDocumentacionCarpetas(maquina.driveFolders, {
    getManifest,
    readFileSmart,
  });
  if (documentos.length === 0) {
    throw new Error(`La máquina "${maquina.nombreModelo || maquina.idBusquetti}" no tiene documentación legible.`);
  }

  const documentosDelModelo = documentos
    .map((d) => [`--- ARCHIVO: ${d.nombre} ---`, d.contenido, `--- FIN ARCHIVO: ${d.nombre} ---`].join("\n"))
    .join("\n\n");

  // 4. Prompt 2.
  const prompt = prompt2Ficha({
    nombreModelo: maquina.nombreModelo || maquina.idBusquetti,
    idBusquetti: maquina.idBusquetti,
    tipoEquipo: esquema.tipo || tipoEquipo,
    esquemaDelTipo: esquemaComoTexto(esquema),
    documentosDelModelo,
  });

  console.log("[advisor/preparation/ficha] ejecutando Prompt 2", {
    idBusquetti: maquina.idBusquetti,
    tipoEquipo,
    documentos: documentos.length,
    campos: esquema.campos.length,
    promptChars: prompt.length,
  });

  const avisos = [...avisosLectura];
  const crudo = await ejecutarPromptJson(openai, prompt, armarFormatoRespuestaFicha(esquema), avisos);

  // 5. Validación y normalización contra el esquema.
  const { ficha, avisos: avisosValidacion } = validarFicha(crudo, esquema, maquina, esquema.tipo || tipoEquipo);
  avisos.push(...avisosValidacion);

  // 6. Guardar sin vencimiento, con la huella y la versión del esquema.
  const registro = {
    ...ficha,
    huella,
    versionEsquema,
    generadaEn: new Date().toISOString(),
    avisos,
  };
  await cacheSet(CLAVE_FICHA(maquina.idBusquetti), registro, 0);

  console.log("[advisor/preparation/ficha] ficha generada", {
    idBusquetti: maquina.idBusquetti,
    documentados: Object.values(ficha.estados).filter((e) => e !== "no_documentado" && e !== "ambiguo").length,
    avisos: avisos.length,
  });

  return registro;
}

// =============================================================================
// Obtener fichas para la conversación (con actualización por huella)
// =============================================================================

// waitUntil de Vercel permite que una tarea siga después de responder.
// Se carga solo si está instalado @vercel/functions; si no, la tarea corre
// igual (en un servidor local termina sin problema).
let waitUntilVercel; // undefined = todavía no se buscó; null = no disponible
async function enSegundoPlano(promesa) {
  if (waitUntilVercel === undefined) {
    try {
      ({ waitUntil: waitUntilVercel } = await import("@vercel/functions"));
    } catch {
      waitUntilVercel = null;
    }
  }
  if (waitUntilVercel) waitUntilVercel(promesa);
}

// Regeneraciones en curso en este mismo servidor (evita duplicados entre
// pedidos simultáneos que llegan a la misma instancia).
const regeneracionesEnCurso = new Set();

/**
 * Toma el bloqueo de regeneración de una ficha.
 * - Primero en memoria (mismo servidor): la verificación y el registro son
 *   inmediatos, así dos pedidos simultáneos no pasan los dos.
 * - Después en Redis (servidores distintos): con cacheSetNX es atómico
 *   (SET ... NX). Si no se recibió cacheSetNX, se usa cacheGet + cacheSet,
 *   que cubre la mayoría de los casos pero no es atómico entre servidores.
 */
async function tomarBloqueo(claveBloqueo, deps) {
  if (regeneracionesEnCurso.has(claveBloqueo)) return false;
  regeneracionesEnCurso.add(claveBloqueo);

  const valor = { desde: new Date().toISOString() };
  let tomado;
  if (deps.cacheSetNX) {
    tomado = await deps.cacheSetNX(claveBloqueo, valor, BLOQUEO_SEGUNDOS);
  } else {
    tomado = !(await deps.cacheGet(claveBloqueo));
    if (tomado) await deps.cacheSet(claveBloqueo, valor, BLOQUEO_SEGUNDOS);
  }

  if (!tomado) regeneracionesEnCurso.delete(claveBloqueo);
  return tomado;
}

async function liberarBloqueo(claveBloqueo, deps) {
  regeneracionesEnCurso.delete(claveBloqueo);
  await deps.cacheSet(claveBloqueo, null, 1); // vence en 1 segundo
}

/**
 * Regenera una ficha en segundo plano, con bloqueo para que dos
 * conversaciones al mismo tiempo no la regeneren dos veces.
 * Devuelve false si ya había una regeneración en curso.
 */
async function regenerarEnSegundoPlano(maquina, deps) {
  const claveBloqueo = CLAVE_BLOQUEO(maquina.idBusquetti);
  if (!(await tomarBloqueo(claveBloqueo, deps))) return false;

  const tarea = generarFichaMaquina({ ...deps, maquina, tipoEquipo: maquina.tipoEquipo })
    .catch((error) => console.error("[advisor/fichas] error regenerando", maquina.idBusquetti, error?.message))
    .finally(() => liberarBloqueo(claveBloqueo, deps));

  await enSegundoPlano(tarea);
  return true;
}

/** Ejecuta fn sobre cada elemento con un máximo de tareas en paralelo. */
async function procesarConLimite(elementos, limite, fn) {
  const resultados = new Array(elementos.length);
  let siguiente = 0;
  const trabajador = async () => {
    while (siguiente < elementos.length) {
      const i = siguiente++;
      resultados[i] = await fn(elementos[i], i);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limite, elementos.length) }, trabajador));
  return resultados;
}

/**
 * Devuelve la ficha de cada máquina pedida.
 * Cada máquina: { idBusquetti, nombreModelo, tipoEquipo, driveFolders }.
 *
 * Estado de cada resultado:
 * - "vigente": la ficha guardada coincide con Drive y con el esquema.
 * - "actualizando": cambió Drive o el esquema; se devuelve la ficha anterior
 *   y la nueva se está generando en segundo plano.
 * - "generada": no existía y se generó en el momento.
 * - "sin_verificar": no se pudo consultar Drive; se devuelve la ficha guardada.
 * - "sin_esquema" / "error": no hay ficha disponible.
 */
export async function obtenerFichas(maquinas, deps) {
  const { cacheGet } = deps;

  // Esquemas de los tipos pedidos (una sola lectura por tipo).
  const esquemas = new Map();
  for (const maquina of maquinas) {
    const tipo = (maquina?.tipoEquipo || "").trim();
    if (tipo && !esquemas.has(tipo)) esquemas.set(tipo, await cacheGet(CLAVE_ESQUEMA(tipo)));
  }

  return procesarConLimite(maquinas, CONCURRENCIA_FICHAS, async (maquina) => {
    const idBusquetti = maquina?.idBusquetti || null;
    const tipo = (maquina?.tipoEquipo || "").trim();

    if (!idBusquetti || !tipo || !Array.isArray(maquina.driveFolders) || maquina.driveFolders.length === 0) {
      return { idBusquetti, estado: "error", ficha: null, error: "Máquina inválida: faltan idBusquetti, tipoEquipo o driveFolders." };
    }

    const esquema = esquemas.get(tipo);
    if (!esquema) {
      return { idBusquetti, estado: "sin_esquema", ficha: null, error: `No existe el esquema del tipo "${tipo}".` };
    }
    const versionActual = esquema.version || versionDeEsquema(esquema);
    const existente = await cacheGet(CLAVE_FICHA(idBusquetti));

    // Huella actual de Drive (como smartRead: se consulta al momento de usarla).
    let huellaActual;
    try {
      huellaActual = await calcularHuellaCarpetas(maquina.driveFolders, deps.getManifest);
    } catch (error) {
      if (existente) return { idBusquetti, estado: "sin_verificar", ficha: existente, error: error?.message };
      return { idBusquetti, estado: "error", ficha: null, error: error?.message };
    }

    // No existe: se genera en el momento (el cliente espera solo esta vez).
    if (!existente) {
      try {
        const ficha = await generarFichaMaquina({ ...deps, maquina, tipoEquipo: tipo });
        return { idBusquetti, estado: "generada", ficha };
      } catch (error) {
        return { idBusquetti, estado: "error", ficha: null, error: error?.message };
      }
    }

    // Existe y coincide con Drive y con el esquema: se usa tal cual.
    if (existente.huella === huellaActual && existente.versionEsquema === versionActual) {
      return { idBusquetti, estado: "vigente", ficha: existente };
    }

    // Cambió algo: se devuelve la anterior y se regenera en segundo plano.
    await regenerarEnSegundoPlano({ ...maquina, tipoEquipo: tipo }, deps);
    return { idBusquetti, estado: "actualizando", ficha: existente };
  });
}

/**
 * Devuelve la ficha guardada solo si sigue vigente (misma huella de Drive y
 * misma versión de esquema). No genera ni regenera nada: solo consulta.
 */
export async function fichaVigente(maquina, tipoEquipo, deps) {
  const { cacheGet, getManifest } = deps;
  const esquema = await cacheGet(CLAVE_ESQUEMA(tipoEquipo));
  const existente = await cacheGet(CLAVE_FICHA(maquina.idBusquetti));
  if (!esquema || !existente) return null;

  const versionActual = esquema.version || versionDeEsquema(esquema);
  const huellaActual = await calcularHuellaCarpetas(maquina.driveFolders, getManifest);
  return existente.huella === huellaActual && existente.versionEsquema === versionActual ? existente : null;
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
    cacheSetNX, // opcional: bloqueo atómico en Redis (ver index.js)
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

  // ============================================================
  // Prompt 2 — Generar la ficha de una máquina (preparación)
  // ============================================================
  // Body: { tipoEquipo, maquina: { idBusquetti, nombreModelo, driveFolders }, force }
  // Sin force, si la ficha guardada sigue vigente, se devuelve sin regenerar.

  app.post(
    "/advisor/preparation/ficha",
    withTimer(
      "advisorPreparationFicha",
      asyncHandler(async (req, res) => {
        const { tipoEquipo, maquina, force = false } = req.body || {};

        if (!tipoEquipo || typeof tipoEquipo !== "string") {
          return res.status(400).json({ error: "Falta tipoEquipo." });
        }
        if (!maquina?.idBusquetti || !Array.isArray(maquina.driveFolders) || maquina.driveFolders.length === 0) {
          return res.status(400).json({ error: "Se requiere maquina: { idBusquetti, nombreModelo, driveFolders }" });
        }

        const fichaDeps = { openai, getManifest, readFileSmart, cacheGet, cacheSet, cacheSetNX };

        // Sin force: si la ficha guardada sigue vigente, se devuelve sin llamar a la IA.
        if (!force) {
          const vigente = await fichaVigente(maquina, tipoEquipo, fichaDeps);
          if (vigente) {
            return res.status(200).json({ fromCache: true, idBusquetti: maquina.idBusquetti, estado: "vigente", ficha: vigente });
          }
        }

        const ficha = await generarFichaMaquina({ ...fichaDeps, maquina, tipoEquipo });
        return res.status(200).json({ fromCache: false, idBusquetti: maquina.idBusquetti, estado: "generada", ficha });
      })
    )
  );

  // ============================================================
  // Fichas para la conversación (con actualización por huella)
  // ============================================================
  // Body: { maquinas: [{ idBusquetti, nombreModelo, tipoEquipo, driveFolders }] }

  app.post(
    "/advisor/fichas",
    withTimer(
      "advisorFichas",
      asyncHandler(async (req, res) => {
        const { maquinas } = req.body || {};

        if (!Array.isArray(maquinas) || maquinas.length === 0) {
          return res.status(400).json({
            error: "Se requiere maquinas: [{ idBusquetti, nombreModelo, tipoEquipo, driveFolders }]",
          });
        }

        const resultados = await obtenerFichas(maquinas, {
          openai,
          getManifest,
          readFileSmart,
          cacheGet,
          cacheSet,
          cacheSetNX,
        });

        return res.status(200).json({ resultados });
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

  // NUEVO (Prompt 2): versión del esquema y máquinas con las que se generó.
  // Si el esquema cambia, las fichas generadas con la versión anterior se
  // detectan como desactualizadas y se regeneran.
  esquema.version = versionDeEsquema(esquema);
  esquema.maquinas = maquinasConDocumentos.map((m) => m.idBusquetti);

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