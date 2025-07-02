import mammoth from "mammoth";
import { getDocument } from "pdfjs-dist/build/pdf.mjs";

/**
 * Extrae texto desde un buffer según el tipo MIME.
 */
export async function extractTextFromBuffer(buffer, mimeType) {
  try {
    if (mimeType === "application/pdf") {
      return await extractFromPDF(buffer);
    } else if (
      mimeType ===
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    ) {
      const result = await mammoth.extractRawText({ buffer });
      return result.value;
    } else {
      return "Tipo de archivo no soportado para lectura.";
    }
  } catch (error) {
    console.error("❌ Error extrayendo texto:", error);
    return "Error procesando archivo.";
  }
}

async function extractFromPDF(buffer) {
  const pdf = await getDocument({ data: buffer }).promise;
  let fullText = "";

  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    const text = content.items.map((item) => item.str).join(" ");
    fullText += text + "\n\n";
  }

  return fullText.trim();
}
