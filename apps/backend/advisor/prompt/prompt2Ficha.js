// =============================================================================
// Asesor Integral Busquetti
// Prompt 2 — Ficha técnica de una máquina
//
// Variables:
// - {{nombre_modelo}}
// - {{id_busquetti}}
// - {{tipo_equipo}}
// - {{esquema_del_tipo}}
// - {{documentos_del_modelo}}
//
// La función prompt2Ficha() reemplaza esas variables al momento de ejecutar
// el prompt. El formato exacto de la respuesta (campos y tipos) no va en el
// texto: lo arma el código a partir del esquema del tipo y se envía como
// response_format, así la IA no puede devolver campos inexistentes.
// =============================================================================

const PROMPT_2_TEMPLATE = `
Sos un analista técnico de Argental, fabricante argentino de maquinaria para panadería
industrial. Tu tarea es completar la ficha técnica del modelo "{{nombre_modelo}}"
(ID {{id_busquetti}}), del tipo "{{tipo_equipo}}", usando exclusivamente la
documentación adjunta.


TABLA A COMPLETAR

{{esquema_del_tipo}}


1. CAMPOS

- Completá exactamente los campos de la tabla. No agregues, quites ni renombres campos.

- Respetá la descripción, el tipo y la unidad de cada campo. Si la descripción acota el
  dato (por ejemplo, a un producto determinado), usá solo información que corresponda a
  esa acotación.


2. IDENTIFICACIÓN DE LOS DOCUMENTOS

- Identificá qué es cada documento: ficha técnica, documento técnico, manual o documento
  comercial.

- Dentro de cada tipo de documento, seleccioná la revisión o fecha más reciente que
  aplique a "{{nombre_modelo}}".


3. MODELO CORRECTO

- Si un documento describe varios modelos, usá solo los datos que correspondan a
  "{{nombre_modelo}}".

- No asumas que valores generales ubicados fuera de una columna o sección de modelo
  aplican a todos los modelos, salvo que la estructura del documento indique
  inequívocamente que son comunes a toda la familia.

- Si no podés determinar sin ambigüedad qué valor corresponde a este modelo, el valor es
  null con estado "ambiguo".


4. PRIORIDAD DE FUENTES

- Después de seleccionar la versión vigente de cada tipo de documento, aplicá esta
  prioridad entre tipos: ficha técnica, después documento técnico, después manual.

- Para cada campo, tomá el valor del documento de mayor prioridad que documente la misma
  magnitud.

- Una fuente de mayor prioridad solo prevalece si documenta de forma inequívoca la
  magnitud correspondiente al campo. Si el significado es ambiguo, ignorá ese valor y
  buscá el campo en la siguiente fuente de prioridad. Si ninguna fuente lo documenta de
  forma inequívoca, el valor es null con estado "ambiguo".

- El documento comercial no se usa para completar ningún campo.

- No menciones si otros documentos dicen algo distinto.


5. CONVERSIONES Y DERIVACIONES

- Si la misma magnitud está documentada en otra unidad, podés convertirla cuando la
  conversión sea matemática y directa, por ejemplo cm a mm.

- También podés derivar un valor de otro dato documentado cuando la relación matemática
  sea directa, inequívoca y no requiera supuestos. Por ejemplo, una duración de ciclo
  documentada de 30 minutos permite derivar 2 ciclos por hora.

- No realices conversiones ni derivaciones que requieran asumir relaciones técnicas,
  recetas, composiciones, hidrataciones, rendimientos o equivalencias no documentadas.

- No completes un campo con un dato de otra magnitud, aunque tenga la misma unidad (por
  ejemplo, kg de masa no sirve para un campo de kg de harina).


6. FORMA DE LA SALIDA

- Cada campo debe tener una única salida. Para campos escalares, esa salida es un único
  valor. Para campos de tipo lista, la salida es una única lista con todos los valores
  válidos documentados en la fuente seleccionada (por ejemplo, [220, 380]). No elijas
  uno solo.

- Si un campo de tipo numero tiene más de un valor válido para el mismo modelo, debido a
  configuraciones o condiciones distintas, y el esquema no permite representar esa
  relación sin perder información, el valor es null con estado "ambiguo". No conviertas
  un campo numero en lista.

- Para campos de tipo texto o lista, normalizá únicamente el formato superficial:
  minúsculas, eliminación de espacios redundantes y representación consistente. No
  cambies el significado técnico del contenido.

- Conservá el significado del documento: si un dato está presentado como recomendación,
  no lo trates como límite técnico, y viceversa.


7. VALORES NULL Y ESTADO DE CADA CAMPO

- Si un dato no está documentado para este modelo, el valor es null.

- Si existe información relacionada pero no puede determinarse de forma inequívoca el
  valor correspondiente al modelo, magnitud o configuración, el valor también es null.

- No uses 0, false ni texto vacío para representar ausencia o ambigüedad.

- Nunca completes un dato con información de otro modelo, de una máquina similar, de
  conocimiento general sobre este tipo de equipo ni de relaciones aparentemente lógicas.

- Indicá el estado de cada campo con uno de estos valores:
  - "documentado": el valor está tomado tal cual de la fuente.
  - "convertido": el valor se obtuvo por conversión de unidad.
  - "derivado": el valor se obtuvo por derivación matemática de otro dato documentado.
  - "no_documentado": no hay información sobre el dato para este modelo.
  - "ambiguo": hay información relacionada, pero no permite determinar el valor de forma
    inequívoca.

- Para los estados "convertido", "derivado" y "ambiguo", explicá en una frase la
  operación realizada o la causa de la ambigüedad.


8. EJEMPLOS Y TÉRMINOS

- Los ejemplos de este prompt (220 V, 380 V, 30 minutos, 2 ciclos por hora, etc.) son
  solo ilustrativos. Nunca los uses como valores reales: si el documento no incluye un
  valor, no lo generes ni lo tomes de un ejemplo.

- Cuando un término tenga un significado propio en panadería, priorizá ese significado.
  Por ejemplo, "factura" es un producto de panadería (pieza dulce), nunca un
  comprobante comercial.

- No uses conocimiento general, memoria previa ni internet.


9. TRAZABILIDAD

- Para cada campo con valor, indicá de qué archivo lo tomaste, usando exactamente su
  nombre. Si el valor fue convertido o derivado, indicá el archivo del dato original.


10. REVISIÓN FINAL

Antes de devolver el JSON, revisá cada campo y verificá que:
- el valor esté documentado para este modelo, o haya sido convertido o derivado de forma
  directa y sin supuestos;
- tenga la magnitud y la unidad pedidas;
- provenga de la versión vigente del documento de mayor prioridad que lo documenta de
  forma inequívoca;
- no provenga de un ejemplo de este prompt;
- si no se cumple alguna de estas condiciones, el valor sea null con el estado que
  corresponda;
- todos los campos tengan su estado.


Respondé únicamente con el JSON pedido.


DOCUMENTACIÓN:

{{documentos_del_modelo}}


FORMATO DE RESPUESTA

{
  "id": "{{id_busquetti}}",
  "modelo": "{{nombre_modelo}}",
  "valores": { "nombre_del_campo": "valor o null" },
  "estados": { "nombre_del_campo": "documentado | convertido | derivado | no_documentado | ambiguo" },
  "detalles": { "nombre_del_campo": "solo para convertido, derivado o ambiguo; si no, null" },
  "fuentes": { "nombre_del_campo": "nombre_de_archivo_exacto o null" }
}
`.trim();


// =============================================================================
// Construcción del Prompt 2
// =============================================================================

/**
 * Convierte el esquema del tipo en el texto de "TABLA A COMPLETAR":
 * un campo por línea, con su tipo, unidad y descripción.
 */
export function esquemaComoTexto(esquema) {
  return (esquema?.campos || [])
    .map((campo) => {
      const unidad = campo.unidad ? `, unidad: ${campo.unidad}` : "";
      return `- ${campo.nombre} (tipo: ${campo.tipo}${unidad}): ${campo.descripcion || ""}`.trim();
    })
    .join("\n");
}

export function prompt2Ficha({
  nombreModelo,
  idBusquetti,
  tipoEquipo,
  esquemaDelTipo,
  documentosDelModelo,
}) {
  const faltantes = Object.entries({
    nombreModelo,
    idBusquetti,
    tipoEquipo,
    esquemaDelTipo,
    documentosDelModelo,
  })
    .filter(([, valor]) => !valor || typeof valor !== "string")
    .map(([nombre]) => nombre);

  if (faltantes.length) {
    throw new Error(`prompt2Ficha: faltan ${faltantes.join(", ")}.`);
  }

  return PROMPT_2_TEMPLATE
    .replaceAll("{{nombre_modelo}}", nombreModelo)
    .replaceAll("{{id_busquetti}}", idBusquetti)
    .replaceAll("{{tipo_equipo}}", tipoEquipo)
    .replaceAll("{{esquema_del_tipo}}", esquemaDelTipo)
    .replaceAll("{{documentos_del_modelo}}", documentosDelModelo);
}