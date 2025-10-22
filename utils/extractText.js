// utils/extractText.js
import mammoth from "mammoth";
import libre from "libreoffice-convert";
import { PDFDocument } from "pdf-lib";
import PDFParser from "pdf2json";

/**
 * Extrae texto desde un Buffer según mimeType.
 * Soporta rango de páginas para PDFs vía opts { fromPage, toPage } (1-based).
 * - Para PDF: intenta pdf2json → pdf-lib → raw
 * - Para DOCX: mammoth
 * - Para DOC: convierte a DOCX con libreoffice y luego mammoth
 */
export async function extractTextFromBuffer(buffer, mimeType, opts = {}) {
  try {
    const mt = (mimeType || "").toLowerCase();

    if (mt.includes("pdf")) {
      return await extractFromPDF(buffer, opts);
    }

    if (mt === "application/vnd.openxmlformats-officedocument.wordprocessingml.document") {
      const result = await mammoth.extractRawText({ buffer });
      return cleanText(result.value);
    }

    if (mt === "application/msword") {
      const converted = await convertDOCtoDOCX(buffer);
      const result = await mammoth.extractRawText({ buffer: converted });
      return cleanText(result.value);
    }

    return "Tipo de archivo no soportado para lectura.";
  } catch (error) {
    console.error("❌ Error extrayendo texto:", error);
    return "Error procesando archivo.";
  }
}

/**
 * PDF: extracción con fallback y soporte de rango de páginas (fromPage/toPage, 1-based).
 */
export async function extractFromPDF(buffer, opts = {}) {
  const { fromPage, toPage } = normalizeRange(opts);

  // 1) Intentar con pdf2json (mejor para texto estructurado)
  try {
    const text = await extractWithPDF2JSON(buffer, { fromPage, toPage });
    if (text && text.length > 100) return text; // heurística: resultado significativo
  } catch (error) {
    console.log("pdf2json falló o devolvió poco texto, intentando con pdf-lib...");
  }

  // 2) Intentar con pdf-lib (fallback básico; NO es un extractor perfecto)
  try {
    const text = await extractWithPDFLib(buffer, { fromPage, toPage });
    if (text && text.length > 100) return text;
  } catch (error) {
    console.log("pdf-lib falló, intentando método de respaldo (raw)...");
  }

  // 3) Respaldo: intento de decodificación "raw" del buffer
  try {
    const text = await extractRawText(buffer);
    if (text && text.length > 100) return text;
  } catch (error) {
    console.error("Todos los métodos de extracción fallaron:", error);
  }

  return "No se pudo extraer texto legible del PDF. El archivo podría estar protegido o contener solo imágenes.";
}

/* =========================
   Implementaciones internas
   ========================= */

function normalizeRange({ fromPage, toPage } = {}) {
  // 1-based. Si no llega rango, devolver indefinido (leer todo).
  const f = Number(fromPage);
  const t = Number(toPage);
  if (Number.isFinite(f) && Number.isFinite(t) && f > 0 && t >= f) {
    return { fromPage: f, toPage: t };
  }
  if (Number.isFinite(f) && f > 0) {
    return { fromPage: f, toPage: f };
  }
  return { fromPage: undefined, toPage: undefined };
}

function cleanText(txt = "") {
  return String(txt)
    .replace(/[\x00-\x1F\x7F-\x9F]/g, " ") // control chars
    .replace(/\s+/g, " ")
    .trim();
}

async function extractWithPDF2JSON(buffer, { fromPage, toPage } = {}) {
  return new Promise((resolve, reject) => {
    const pdfParser = new PDFParser(null, 1);

    pdfParser.on("pdfParser_dataReady", (pdfData) => {
      try {
        const pages = pdfData.Pages || [];
        const total = pages.length;

        // Normalizar rango con límites del documento
        let start = fromPage ? Math.max(1, Math.min(fromPage, total)) : 1;
        let end = toPage ? Math.max(start, Math.min(toPage, total)) : total;

        const slice = pages.slice(start - 1, end); // pdf2json usa 0-based internamente

        // Unir texto de las páginas del rango
        const text = decodeURIComponent(
          slice
            .map((page) =>
              (page.Texts || [])
                .map((t) => (t.R || []).map((r) => r.T).join(" "))
                .join(" ")
            )
            .join("\n")
        )
          .replace(/\\\(/g, "(")
          .replace(/\\\)/g, ")")
          .replace(/\\/g, "")
          .replace(/\s+/g, " ")
          .trim();

        resolve(cleanText(text));
      } catch (err) {
        reject(err);
      }
    });

    pdfParser.on("pdfParser_dataError", (error) => reject(error));

    const uint8Array = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
    pdfParser.parseBuffer(uint8Array);
  });
}

async function extractWithPDFLib(buffer, { fromPage, toPage } = {}) {
  const pdfDoc = await PDFDocument.load(buffer, { ignoreEncryption: true });
  const pages = pdfDoc.getPages();
  const total = pages.length;

  let start = fromPage ? Math.max(1, Math.min(fromPage, total)) : 1;
  let end = toPage ? Math.max(start, Math.min(toPage, total)) : total;

  let text = "";
  for (let i = start - 1; i < end; i++) {
    const page = pages[i];
    // pdf-lib no expone extractor de texto; como fallback, reflectamos el stream.
    // OJO: esto suele traer texto "ensuciado" (operators). Es un último recurso.
    if (page?.node?.Contents) {
      text += " " + String(page.node.Contents);
    }
  }

  return cleanText(text);
}

async function extractRawText(buffer) {
  const textDecoder = new TextDecoder("utf-8");
  let rawText = textDecoder.decode(buffer);
  return cleanText(rawText);
}

async function convertDOCtoDOCX(inputBuffer) {
  return new Promise((resolve, reject) => {
    libre.convert(inputBuffer, ".docx", undefined, (err, done) => {
      if (err) return reject(`Error al convertir DOC a DOCX: ${err}`);
      resolve(done);
    });
  });
}


