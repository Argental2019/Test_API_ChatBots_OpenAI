import mammoth from "mammoth";
import libre from "libreoffice-convert";
//import { file as tmpFile } from "tmp-promise";
import { fromBuffer } from "pdf2pic";
import Tesseract from "tesseract.js";

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
    const convert = fromBuffer(buffer, {
      density: 150,
      format: "png",
      width: 1200,
      height: 1600,
    });

    const totalPages = await convert.numberOfPages();

    let fullText = "";

    for (let i = 1; i <= totalPages; i++) {
      const result = await convert(i, false); // i = página, false = no guardar archivo

      const ocr = await Tesseract.recognize(result.base64, "eng", {
        logger: (m) => console.log(`OCR [página ${i}]`, m.status),
      });

      fullText += ocr.data.text + "\n\n";
    }

    return fullText.trim();
  } catch (error) {
    console.error("❌ Error extrayendo texto con OCR:", error);
    return "Error procesando PDF con OCR.";
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
