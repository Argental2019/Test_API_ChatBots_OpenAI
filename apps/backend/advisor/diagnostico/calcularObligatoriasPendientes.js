/**
 * Calcula cuáles preguntas obligatorias de la guía todavía
 * no están completamente resueltas.
 *
 * Reglas:
 *
 * 1. Las preguntas opcionales no participan de este cálculo.
 *
 * 2. Una respuesta está resuelta si su estado es:
 *    - "confirmado"
 *    - "no_disponible"
 *
 * 3. Si una pregunta tiene respuestas asociadas a productos,
 *    se considera una pregunta "por producto".
 *
 *    En ese caso deben existir respuestas resueltas para TODOS
 *    los productos actuales de registro.busqueda.productos.
 *
 * 4. Esta función NO llama a la IA y NO modifica el registro.
 *    Solo deriva información a partir de la guía y del diagnóstico.
 */
export function calcularObligatoriasPendientes({
  preguntasGuia,
  registro,
}) {
  // Normalizamos las entradas para evitar errores si falta alguna colección.
  const preguntas = Array.isArray(preguntasGuia)
    ? preguntasGuia
    : [];

  const respuestas = Array.isArray(registro?.respuestas)
    ? registro.respuestas
    : [];

  const productos = Array.isArray(registro?.busqueda?.productos)
    ? registro.busqueda.productos
    : [];

  /**
   * Una respuesta solamente cuenta como resuelta cuando Prompt 3
   * la dejó explícitamente confirmada o no disponible.
   */
  const respuestaEstaResuelta = (respuesta) =>
    respuesta?.estado === "confirmado" ||
    respuesta?.estado === "no_disponible";

  // Recorremos solamente las preguntas obligatorias.
  return preguntas
    .filter((pregunta) => pregunta?.obligatoria === true)
    .flatMap((pregunta) => {
      const numero = Number(pregunta?.numero);

      // Si la guía tuviera una pregunta sin número válido,
      // no la usamos para evitar resultados inconsistentes.
      if (!Number.isFinite(numero)) {
        return [];
      }

      // Obtenemos todas las respuestas correspondientes
      // a esta pregunta.
      const respuestasPregunta = respuestas.filter(
        (respuesta) =>
          Number(respuesta?.pregunta) === numero &&
          respuestaEstaResuelta(respuesta)
      );

      /**
       * Si todavía no existe ninguna respuesta resuelta,
       * la pregunta continúa pendiente completa.
       */
      if (respuestasPregunta.length === 0) {
        return [
          {
            ...pregunta,
            productosPendientes: [],
          },
        ];
      }

      /**
       * Detectamos si esta pregunta se está respondiendo por producto.
       *
       * No hardcodeamos que "la pregunta 3 es volumen" ni nada similar.
       * Lo deducimos de la estructura generada por Prompt 3:
       *
       * producto: "Medialunas"
       */
      const esPorProducto = respuestasPregunta.some(
        (respuesta) =>
          typeof respuesta?.producto === "string" &&
          respuesta.producto.trim() !== ""
      );

      /**
       * Si la pregunta no se responde por producto,
       * con una respuesta válida ya está resuelta.
       */
      if (!esPorProducto) {
        return [];
      }

      /**
       * Si se responde por producto, averiguamos para cuáles
       * productos ya existe una respuesta resuelta.
       */
      const productosRespondidos = new Set(
        respuestasPregunta
          .map((respuesta) => respuesta?.producto)
          .filter(
            (producto) =>
              typeof producto === "string" &&
              producto.trim() !== ""
          )
      );

      // Comparamos contra los productos actualmente confirmados
      // en la búsqueda del diagnóstico.
      const productosPendientes = productos.filter(
        (producto) => !productosRespondidos.has(producto)
      );

      /**
       * Si todos los productos tienen respuesta, la pregunta
       * obligatoria está completamente resuelta.
       */
      if (productosPendientes.length === 0) {
        return [];
      }

      /**
       * Si faltan productos, mantenemos la pregunta pendiente
       * e indicamos cuáles faltan.
       *
       * Esto después ayuda a Prompt 4 a preguntar específicamente
       * por el producto faltante sin repetir los ya respondidos.
       */
      return [
        {
          ...pregunta,
          productosPendientes,
        },
      ];
    });
}