import mammoth from "mammoth";
import libre from "libreoffice-convert";
//import { file as tmpFile } from "tmp-promise";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const PDFParser = require("pdf2json");

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
  return new Promise((resolve, reject) => {
    const pdfParser = new PDFParser();

    pdfParser.on("pdfParser_dataError", (err) => {
      console.error("❌ Error leyendo PDF:", err.parserError);
      reject("Error leyendo PDF.");
    });

    pdfParser.on("pdfParser_dataReady", (pdfData) => {
      try {
        if (!pdfData.FormImage || !Array.isArray(pdfData.FormImage.Pages)) {
          console.log("📄 PDF sin estructura reconocida.");
          return resolve("Este PDF no tiene texto extraíble.");
        }
        console.log(
          "📄 Estructura PDF recibida:",
          JSON.stringify(pdfData.FormImage.Pages, null, 2),
        );
        // Extraer texto de cada página
        const pagesText = pdfData.FormImage.Pages.map((page) =>
          page.Texts.map((t) =>
            decodeURIComponent(t.R.map((r) => r.T).join("")),
          ).join(" "),
        );

        const finalText = pagesText.join("\n\n").trim();

        if (!finalText) {
          console.log("📄 Texto vacío después de decodificar.");
          return resolve("Este PDF no tiene texto extraíble.");
        }
        resolve(finalText);
      } catch (err) {
        console.error("❌ Error procesando PDF:", err);
        reject("Error procesando PDF.");
      }
    });
    pdfParser.parseBuffer(buffer);
  });
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
