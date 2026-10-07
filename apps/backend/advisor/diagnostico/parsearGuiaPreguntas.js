/**
 * Convierte el texto extraído del documento de Drive en una lista
 * estructurada de preguntas para el Asesor Integral.
 *
 * Formato temporal esperado en el documento:
 *
 * OBLIGATORIA | ¿Pregunta...?
 * OPCIONAL | ¿Pregunta...?
 *
 * IMPORTANTE:
 * El extractor de DOCX puede eliminar los saltos de línea y devolver
 * todo el documento como una única cadena. Por eso NO dependemos
 * de párrafos ni de saltos de línea.
 */
export function parsearGuiaPreguntas(contenido) {
  // Validamos que realmente hayamos recibido texto.
  if (typeof contenido !== "string" || !contenido.trim()) {
    throw new Error("La guía de preguntas no contiene texto");
  }

  /**
   * Buscamos únicamente marcadores que estén seguidos por una
   * pregunta real que empiece con "¿".
   *
   * Esto es importante porque la introducción del documento dice:
   *
   * "cada pregunta comienza con OBLIGATORIA | u OPCIONAL |"
   *
   * y no queremos interpretar esa explicación como si fuera
   * una pregunta de la guía.
   *
   * La captura termina cuando aparece:
   *
   * - otra OBLIGATORIA | ¿...?
   * - otra OPCIONAL | ¿...?
   * - el texto final del documento temporal
   * - o el final del archivo
   */
/**
 * Buscamos cualquier bloque que empiece con:
 *
 * OBLIGATORIA |
 * OPCIONAL |
 *
 * y termine cuando aparece el próximo marcador o el final del documento.
 *
 * No exigimos que la pregunta empiece directamente con "¿", porque una
 * pregunta puede comenzar con contexto, por ejemplo:
 *
 * "Si ya estás produciendo, ¿en qué etapa...?"
 */
const regex =
  /(OBLIGATORIA|OPCIONAL)\s*\|\s*([\s\S]*?)(?=\s+(?:OBLIGATORIA|OPCIONAL)\s*\||$)/gi;

const preguntas = [];

let coincidencia;

// Recorremos todos los bloques encontrados.
while ((coincidencia = regex.exec(contenido)) !== null) {
  const tipo = coincidencia[1].toUpperCase();

  // Normalizamos espacios porque el extractor del DOCX
  // devuelve el documento prácticamente como una sola línea.
  let texto = coincidencia[2]
    .replace(/\s+/g, " ")
    .trim();

  /**
   * La introducción del documento también menciona literalmente:
   *
   * "OBLIGATORIA | u OPCIONAL |"
   *
   * Esos bloques no son preguntas.
   *
   * Para distinguirlos, exigimos que el bloque tenga al menos
   * un signo de cierre de pregunta.
   */
  const ultimoSignoPregunta = texto.lastIndexOf("?");

  if (ultimoSignoPregunta === -1) {
    continue;
  }

  /**
   * Nos quedamos únicamente hasta el último "?".
   *
   * Esto también elimina cualquier texto explicativo que pueda
   * aparecer después de la última pregunta del documento.
   */
  texto = texto.slice(0, ultimoSignoPregunta + 1).trim();

  preguntas.push({
    // La numeración siempre depende del orden de la guía.
    numero: preguntas.length + 1,

    pregunta: texto,

    // Convertimos la marca textual del documento en booleano.
    obligatoria: tipo === "OBLIGATORIA",
  });
}
  // Si no encontramos ninguna pregunta, preferimos fallar
  // explícitamente antes que enviar una guía vacía a los prompts.
  if (preguntas.length === 0) {
    throw new Error(
      "No se encontraron preguntas con formato OBLIGATORIA | ¿...? u OPCIONAL | ¿...?"
    );
  }

  return preguntas;
}