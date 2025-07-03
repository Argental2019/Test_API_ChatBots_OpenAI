import mammoth from "mammoth";
import libre from "libreoffice-convert";
//import { file as tmpFile } from "tmp-promise";
import pdf from "pdf-parse"; // basado en documentación oficia

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
  try {
    const data = await pdf(buffer); // pdf(buffer) retorna un objeto con `.text`, `.numpages`, etc.
    const text = data.text?.trim();

    if (!text) {
      return "Este PDF no tiene texto extraíble.";
    }

    return text;
  } catch (error) {
    console.error("❌ Error extrayendo texto con pdf-parse:", error);
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
