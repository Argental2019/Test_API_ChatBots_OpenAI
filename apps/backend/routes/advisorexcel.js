// =============================================================================
// Asesor Integral — Endpoint GET /advisor/excel
//
// Baja de Drive el Excel SISTEMAS_PRODUCTIVOS, lo convierte en matrices de
// celdas (una por hoja, con sus celdas combinadas) y lo devuelve en el formato
// que espera la web (tipo LibroExcel de apps/web/lib/advisor/excel/types.ts).
//
// No interpreta el contenido: solo lo convierte. La interpretación (etapas,
// productos, equipos) la hace leerCatalogo.ts en la web.
//
// Caché: la clave incluye el etag del archivo en Drive. Si el Excel no cambió,
// se responde desde el caché; si cambió, el etag es otro y se vuelve a leer.
// =============================================================================

import * as XLSX from "xlsx";

const MIME_XLSX = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
const MIME_GOOGLE_SHEET = "application/vnd.google-apps.spreadsheet";
const TTL_CACHE_SEGUNDOS = 60 * 60 * 24 * 7; // 7 días; igual se renueva si cambia el archivo

/**
 * Convierte una celda de SheetJS en un valor simple.
 * - Errores (#REF!, #N/A…): se devuelve el texto del error, para que la web lo
 *   detecte y lo informe como aviso.
 * - Fórmulas: se usa el último valor calculado que Excel guardó en el archivo.
 */
function valorCelda(celda) {
  if (!celda) return null;
  switch (celda.t) {
    case "e": // error
      return celda.w || "#ERROR!";
    case "n": // número
      return typeof celda.v === "number" ? celda.v : null;
    case "b": // booleano
      return Boolean(celda.v);
    case "d": // fecha
      return celda.v instanceof Date ? celda.v.toISOString() : String(celda.v);
    case "z": // celda vacía con formato
      return null;
    default: // texto
      return celda.v === undefined || celda.v === null ? null : String(celda.v);
  }
}

/** ¿La celda está vacía? (para recortar filas y columnas vacías al final) */
const vacia = (v) => v === null || v === "";

/**
 * Convierte el archivo (buffer) en el formato LibroExcel.
 * Las filas y columnas mantienen su posición real desde A1, así los números
 * de fila que informan los avisos coinciden con los del Excel.
 */
export function libroDesdeBuffer(buffer, version) {
  const libro = XLSX.read(buffer, { type: "buffer", cellFormula: false, cellHTML: false });
  const hojas = {};

  for (const nombre of libro.SheetNames) {
    const hoja = libro.Sheets[nombre];
    if (!hoja["!ref"]) {
      hojas[nombre] = { filas: [], combinadas: [] };
      continue;
    }

    const rango = XLSX.utils.decode_range(hoja["!ref"]);
    const filas = [];
    for (let r = 0; r <= rango.e.r; r++) {
      const fila = [];
      for (let c = 0; c <= rango.e.c; c++) {
        fila.push(valorCelda(hoja[XLSX.utils.encode_cell({ r, c })]));
      }
      while (fila.length && vacia(fila[fila.length - 1])) fila.pop(); // columnas vacías al final
      filas.push(fila);
    }
    while (filas.length && filas[filas.length - 1].length === 0) filas.pop(); // filas vacías al final

    const combinadas = (hoja["!merges"] || []).map((m) => ({
      s: { r: m.s.r, c: m.s.c },
      e: { r: m.e.r, c: m.e.c },
    }));

    hojas[nombre] = { filas, combinadas };
  }

  return { version, hojas };
}

/** Si el Excel fuera una Hoja de cálculo de Google, se exporta como .xlsx. */
async function exportarComoXlsx(drive, fileId) {
  const { data } = await drive.files.export(
    { fileId, mimeType: MIME_XLSX },
    { responseType: "arraybuffer" }
  );
  return Buffer.from(data);
}

/**
 * Registra los endpoints del asesor en la app de Express.
 * Recibe las funciones que ya existen en index.js, para reutilizar la misma
 * conexión a Drive, el mismo caché y las mismas métricas.
 */
export function registerAdvisorRoutes(app, deps) {
  const { getDrive, getFileMeta, getFileBinary, cacheGet, cacheSet, withTimer, asyncHandler } = deps;

  app.get(
    "/advisor/excel",
    withTimer(
      "advisorExcel",
      asyncHandler(async (_req, res) => {
        // El ID del archivo viene de una variable de entorno, no del pedido:
        // este endpoint solo puede leer el Excel del asesor.
        const fileId = process.env.ADVISOR_EXCEL_FILE_ID;
        if (!fileId) {
          return res.status(500).json({ error: "Falta la variable de entorno ADVISOR_EXCEL_FILE_ID" });
        }

        // 1) Metadatos del archivo (incluye el etag, que cambia si el archivo cambia).
        const meta = await getFileMeta(fileId);
        const version = `${meta.id}:${meta.etag}`;
        const claveCache = `advisor:excel:${version}`;

        // 2) Si esta versión ya está convertida, se devuelve desde el caché.
        const enCache = await cacheGet(claveCache);
        if (enCache) return res.status(200).json(enCache);

        // 3) Si no, se baja el archivo y se convierte.
        //    getFileBinary exporta los documentos de Google como Word, así que
        //    las hojas de cálculo de Google se exportan aparte como .xlsx.
        const buffer =
          meta.mimeType === MIME_GOOGLE_SHEET
            ? await exportarComoXlsx(getDrive(), fileId)
            : await getFileBinary(fileId, meta.mimeType);

        const libro = libroDesdeBuffer(buffer, version);
        await cacheSet(claveCache, libro, TTL_CACHE_SEGUNDOS);

        console.log("[advisor/excel] convertido", {
          version,
          hojas: Object.fromEntries(Object.entries(libro.hojas).map(([n, h]) => [n, h.filas.length])),
        });
        return res.status(200).json(libro);
      })
    )
  );
}