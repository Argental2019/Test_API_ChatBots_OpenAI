import mammoth from "mammoth";
import libre from "libreoffice-convert";
//import { file as tmpFile } from "tmp-promise";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const PDFExtract = require("pdf.js-extract").PDFExtract;

/**
 * Extrae texto desde un buffer según el tipo MIME.
 */

export async function extractTextFromBuffer(buffer, mimeType) {
  try {
    if (mimeType.includes("pdf")) {
      return await extractFromPDF(buffer);
    } else if (
      mimeType ===
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    ) {
      const result = await mammoth.extractRawText({ buffer });
      return result.value;
    } else if (mimeType === "application/msword") {
      // Convertir .doc a .docx
      const converted = await convertDOCtoDOCX(buffer);
      const result = await mammoth.extractRawText({ buffer: converted });
      return result.value;
    } else {
      return "Tipo de archivo no soportado para lectura.";
    }
  } catch (error) {
    console.error("❌ Error extrayendo texto:", error);
    return "Error procesando archivo.";
  }
}

export async function extractFromPDF(buffer) {
  const pdfExtract = new PDFExtract();
  const options = {};
  try {
    const data = await new Promise((resolve, reject) => {
      pdfExtract.extractBuffer(buffer, options, (err, data) => {
        if (err) return reject(err);
        resolve(data);
      });
    });
    // Extraer el texto de todas las páginas
    const pagesText = data.pages.map((page) =>
      page.content.map((item) => item.str).join(" "),
    );

    return pagesText.join("\n\n").trim();
  } catch (error) {
    console.error("❌ Error extrayendo texto con pdf.js-extract:", error);
    return "Error procesando PDF.";
  }
}

async function convertDOCtoDOCX(inputBuffer) {
  return new Promise((resolve, reject) => {
    libre.convert(inputBuffer, ".docx", undefined, (err, done) => {
      if (err) {
        return reject(`Error al convertir DOC a DOCX: ${err}`);
      }
      resolve(done);
    });
  });
}
