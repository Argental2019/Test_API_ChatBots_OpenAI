import mammoth from "mammoth";
//import { getDocument } from "pdfjs-dist/build/pdf.mjs";
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

/*async function extractFromPDF(buffer) {
  const uint8Array = new Uint8Array(buffer);
  const pdf = await getDocument({ data: uint8Array }).promise;
  let fullText = "";

  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    const text = content.items.map((item) => item.str).join(" ");
    fullText += text + "\n\n";
  }

  return fullText.trim();
}*/
/*export async function extractFromPDF(buffer) {
  return new Promise((resolve, reject) => {
    const pdfParser = new PDFParser();

    pdfParser.on("pdfParser_dataError", (err) => {
      console.error("❌ Error leyendo PDF:", err.parserError);
      reject("Error leyendo PDF.");
    });

    pdfParser.on("pdfParser_dataReady", (pdfData) => {
      const text = pdfData.FormImage.Pages.map((page) =>
        page.Texts.map((t) =>
          decodeURIComponent(t.R.map((r) => r.T).join("")),
        ).join(" "),
      ).join("\n\n");

      resolve(text.trim());
    });

    pdfParser.parseBuffer(buffer);
  });
}*/

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
          console.warn("⚠️ PDF sin contenido visible o no estructurado");
          return resolve("Este archivo PDF no tiene texto reconocible.");
        }

        const text = pdfData.FormImage.Pages.map((page) =>
          page.Texts.map((t) =>
            decodeURIComponent(t.R.map((r) => r.T).join("")),
          ).join(" "),
        ).join("\n\n");

        resolve(text.trim());
      } catch (err) {
        console.error("❌ Error procesando estructura del PDF:", err);
        reject("Error al procesar el contenido del PDF.");
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
