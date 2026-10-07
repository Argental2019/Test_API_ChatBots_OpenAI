/**
 * Evalúa si queda alguna pregunta opcional relevante para el diagnóstico.
 *
 * IMPORTANTE:
 * - No conversa con el cliente.
 * - No modifica el registro.
 * - No decide por sí sola que el diagnóstico terminó.
 * - Solo devuelve qué pregunta opcional, si existe alguna,
 *   puede cambiar la recomendación o el dimensionamiento.
 *
 * El código que llama a esta función sigue siendo quien decide
 * si el diagnóstico continúa o termina.
 */
export async function evaluarOpcionales({
  openai,
  preguntasGuia,
  registro,
  historial,
}) {
  // ---------------------------------------------------------------------------
  // IDENTIFICAMOS LAS PREGUNTAS OPCIONALES DE LA GUÍA
  // ---------------------------------------------------------------------------
  //
  // No hardcodeamos números.
  //
  // Si mañana la guía cambia:
  // - cantidad de preguntas,
  // - orden,
  // - cuáles son opcionales,
  //
  // esta lógica sigue funcionando porque se basa en "obligatoria: false".
  //
  const preguntasOpcionales = preguntasGuia.filter(
    (pregunta) => pregunta.obligatoria === false
  );


  // Si la guía directamente no tiene opcionales,
  // no hace falta consultar al modelo.
  if (preguntasOpcionales.length === 0) {
    return {
      hayOpcionalRelevante: false,
      pregunta: null,
      motivo: null,
    };
  }


  // ---------------------------------------------------------------------------
  // IDENTIFICAMOS QUÉ PREGUNTAS YA ESTÁN RESUELTAS
  // ---------------------------------------------------------------------------
  //
  // Consideramos resuelta una pregunta si existe una respuesta:
  //
  // - confirmada;
  // - o marcada como no_disponible.
  //
  const numerosResueltos = new Set(
    (registro?.respuestas || [])
      .filter(
        (respuesta) =>
          respuesta.estado === "confirmado" ||
          respuesta.estado === "no_disponible"
      )
      .map((respuesta) => Number(respuesta.pregunta))
  );


  // Nos quedamos únicamente con las opcionales
  // que todavía no fueron resueltas.
  const opcionalesPendientes =
    preguntasOpcionales.filter(
      (pregunta) =>
        !numerosResueltos.has(
          Number(pregunta.numero)
        )
    );


  // Si todas las opcionales ya fueron resueltas,
  // no hay nada más que evaluar.
  if (opcionalesPendientes.length === 0) {
    return {
      hayOpcionalRelevante: false,
      pregunta: null,
      motivo: null,
    };
  }


  // ---------------------------------------------------------------------------
  // PROMPT DE EVALUACIÓN
  // ---------------------------------------------------------------------------
  //
  // Este análisis NO genera una pregunta para el cliente.
  //
  // Solo decide si alguna de las preguntas opcionales pendientes
  // es realmente relevante para ESTE cliente.
  //
  // El criterio es el mismo que ya definimos en Prompt 4:
  //
  // "¿La respuesta puede cambiar la recomendación o
  // cómo se dimensionan los equipos?"
  //
  const prompt = `
Sos un módulo interno del asesor integral de Argental, fabricante argentino de maquinaria para panadería industrial.

Tu única tarea es decidir si alguna de las preguntas opcionales pendientes de la guía es relevante para el cliente actual.

No conversás con el cliente.
No hagas preguntas.
No recomiendes equipos.
No inventes información.

PREGUNTAS OPCIONALES PENDIENTES

${JSON.stringify(opcionalesPendientes, null, 2)}

REGISTRO ACTUAL DEL DIAGNÓSTICO

${JSON.stringify(registro, null, 2)}

CONVERSACIÓN RECIENTE

${JSON.stringify(historial, null, 2)}

REGLAS

1. Evaluá únicamente las preguntas listadas en PREGUNTAS OPCIONALES PENDIENTES.

2. Una pregunta opcional es relevante solamente si su respuesta puede cambiar:
   - qué equipos se recomiendan,
   - qué equipos se descartan,
   - o cómo deben dimensionarse los equipos.

3. No selecciones una pregunta solamente porque sería interesante conocer la respuesta.

4. No selecciones una pregunta si la información ya puede obtenerse claramente del REGISTRO ACTUAL o de la CONVERSACIÓN.

5. No selecciones una pregunta que no aplique a la situación del cliente.

6. Si varias preguntas opcionales son relevantes, elegí una sola:
   la que tenga mayor impacto potencial sobre la recomendación o el dimensionamiento.

7. Usá únicamente números de pregunta existentes en PREGUNTAS OPCIONALES PENDIENTES.

8. Si ninguna pregunta opcional es relevante, devolvé pregunta = null.

EJEMPLOS DE CRITERIO

- Si el cliente está comenzando un proyecto desde cero, una pregunta sobre el cuello de botella de su producción actual normalmente no aplica.

- Si ya conocemos directamente el volumen en kg de harina por día, una pregunta pensada únicamente para ayudar a estimar ese volumen normalmente no es necesaria.

- Una limitación de espacio o acceso puede ser relevante si puede determinar qué equipos pueden instalarse.

Respondé únicamente JSON con este formato:

{
  "pregunta": 0,
  "motivo": "..."
}

Si ninguna pregunta opcional es relevante:

{
  "pregunta": null,
  "motivo": null
}
  `.trim();


  // ---------------------------------------------------------------------------
  // EJECUTAMOS LA EVALUACIÓN
  // ---------------------------------------------------------------------------

  const completion =
    await openai.chat.completions.create({
      model:
        process.env.ADVISOR_PREPARATION_MODEL ||
        "gpt-5.1",

      messages: [
        {
          role: "user",
          content: prompt,
        },
      ],

      response_format: {
        type: "json_object",
      },
    });


  const texto =
    completion.choices?.[0]?.message?.content;


  if (!texto) {
    throw new Error(
      "La evaluación de preguntas opcionales no devolvió contenido"
    );
  }


  let resultado;

  try {
    resultado = JSON.parse(texto);
  } catch {
    throw new Error(
      "La evaluación de preguntas opcionales devolvió un JSON inválido"
    );
  }


  // ---------------------------------------------------------------------------
  // SI NO HAY UNA OPCIONAL RELEVANTE
  // ---------------------------------------------------------------------------

  if (
    resultado.pregunta === null ||
    resultado.pregunta === undefined
  ) {
    return {
      hayOpcionalRelevante: false,
      pregunta: null,
      motivo: null,
    };
  }


  // ---------------------------------------------------------------------------
  // VALIDACIÓN DEL NÚMERO DEVUELTO POR LA IA
  // ---------------------------------------------------------------------------
  //
  // Aunque el prompt le diga al modelo que solo puede elegir
  // preguntas de la lista, el código lo valida igualmente.
  //
  const numeroElegido =
    Number(resultado.pregunta);


  const preguntaElegida =
    opcionalesPendientes.find(
      (pregunta) =>
        Number(pregunta.numero) ===
        numeroElegido
    );


  // Si el modelo devolvió un número inexistente,
  // no dejamos que esa salida afecte el flujo.
  if (!preguntaElegida) {
    console.warn(
      `[advisor][opcionales] La IA devolvió una pregunta opcional inválida: ${resultado.pregunta}`
    );

    return {
      hayOpcionalRelevante: false,
      pregunta: null,
      motivo: null,
    };
  }


  // ---------------------------------------------------------------------------
  // RESULTADO FINAL
  // ---------------------------------------------------------------------------
  //
  // Devolvemos la estructura completa de la pregunta elegida,
  // no solamente el número.
  //
  // Esto nos va a permitir pasársela después a Prompt 4.
  //
  return {
    hayOpcionalRelevante: true,

    pregunta: preguntaElegida,

    motivo:
      typeof resultado.motivo === "string"
        ? resultado.motivo
        : null,
  };
}