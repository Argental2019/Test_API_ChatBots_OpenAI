import mammoth from "mammoth";
import libre from "libreoffice-convert";
import { PDFDocument } from "pdf-lib";
import PDFParser from "pdf2json";

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
  // Intentar primero con pdf2json
  try {
    const text = await extractWithPDF2JSON(buffer);
    if (text && text.length > 100) {
      // Verificar si obtuvimos un resultado significativo
      return text;
    }
  } catch (error) {
    console.log("PDF2JSON falló, intentando con pdf-lib...");
  }

  // Si pdf2json falla o retorna poco texto, intentar con pdf-lib
  try {
    const text = await extractWithPDFLib(buffer);
    if (text && text.length > 100) {
      return text;
    }
  } catch (error) {
    console.log("pdf-lib falló, intentando método de respaldo...");
  }

  // Método de respaldo: intentar extraer texto directamente del buffer
  try {
    const text = await extractRawText(buffer);
    if (text && text.length > 100) {
      return text;
    }
  } catch (error) {
    console.error("Todos los métodos de extracción fallaron:", error);
  }

  return "No se pudo extraer texto legible del PDF. El archivo podría estar protegido o contener solo imágenes.";
}

async function extractWithPDF2JSON(buffer) {
  return new Promise((resolve, reject) => {
    const pdfParser = new PDFParser(null, 1);

    pdfParser.on("pdfParser_dataReady", (pdfData) => {
      try {
        // Decodificar el texto y limpiar caracteres especiales
        const text = decodeURIComponent(
          pdfData.Pages.map((page) =>
            page.Texts.map((text) => text.R.map((r) => r.T).join(" ")).join(
              " ",
            ),
          ).join("\n"),
        )
          .replace(/\\\(/g, "(")
          .replace(/\\\)/g, ")")
          .replace(/\\/g, "")
          .replace(/\s+/g, " ")
          .trim();

        resolve(text);
      } catch (error) {
        reject(error);
      }
    });

    pdfParser.on("pdfParser_dataError", (error) => {
      reject(error);
    });

    // Convertir el buffer a Uint8Array si es necesario
    const uint8Array =
      buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
    pdfParser.parseBuffer(uint8Array);
  });
}

async function extractWithPDFLib(buffer) {
  const pdfDoc = await PDFDocument.load(buffer, {
    ignoreEncryption: true,
  });

  const pages = pdfDoc.getPages();
  let text = "";

  for (const page of pages) {
    const { width, height } = page.getSize();
    if (page.node.Contents) {
      text += " " + page.node.Contents.toString();
    }
  }

  return text
    .trim()
    .replace(/\s+/g, " ")
    .replace(/[^\x20-\x7E\xA0-\xFF]/g, " ") // Mantener solo caracteres imprimibles
    .trim();
}

async function extractRawText(buffer) {
  // Intentar extraer texto directamente del buffer
  const textDecoder = new TextDecoder("utf-8");
  let rawText = textDecoder.decode(buffer);

  // Limpiar el texto
  rawText = rawText
    .replace(/[\x00-\x1F\x7F-\x9F]/g, " ")
    .replace(/\s+/g, " ")
    .replace(/[^\x20-\x7E\xA0-\xFF]/g, " ")
    .trim();

  return rawText;
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
