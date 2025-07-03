import mammoth from "mammoth";
import libre from "libreoffice-convert";
import { PDFDocument } from "pdf-lib";

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
    // Cargar el PDF usando pdf-lib
    const pdfDoc = await PDFDocument.load(buffer, {
      ignoreEncryption: true,
    });

    // Obtener todas las páginas
    const pages = pdfDoc.getPages();
    let text = "";

    // Extraer texto de cada página
    for (const page of pages) {
      const { width, height } = page.getSize();
      text += page.doc.getTitle() || "";

      // Si el PDF tiene texto extraíble
      if (page.node.Contents) {
        text += " " + page.node.Contents.toString();
      }
    }

    text = text.trim();

    if (!text) {
      return "Este PDF no tiene texto extraíble o está protegido.";
    }

    return text;
  } catch (error) {
    console.error("❌ Error extrayendo texto del PDF:", error);

    // Si el error es específico de pdf-lib, intentar con un método alternativo
    try {
      // Convertir el buffer a texto directamente como último recurso
      const textDecoder = new TextDecoder("utf-8");
      let rawText = textDecoder.decode(buffer);

      // Limpiar caracteres no imprimibles
      rawText = rawText.replace(/[\x00-\x1F\x7F-\x9F]/g, "");

      return rawText || "No se pudo extraer texto del PDF.";
    } catch (fallbackError) {
      return "Error procesando PDF. El archivo podría estar dañado o protegido.";
    }
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
