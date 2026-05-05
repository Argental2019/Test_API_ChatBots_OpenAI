// apps/web/app/api/realtime/route.ts
import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  try {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: "OPENAI_API_KEY no configurada" }, { status: 500 });
    }

    const { systemPrompt } = await req.json();

    // Para voz usamos un prompt simplificado — el BASE_PROMPT del chat tiene
    // instrucciones de formato (VER MÁS, markdown, etc.) que no aplican a voz.
    // Extraemos solo las primeras líneas de rol + restricciones, y agregamos
    // instrucciones específicas para conversación oral.

    // Extraer solo los primeros 3000 chars del systemPrompt (rol + restricciones base)
    // y el contexto documental completo que viene al final
    const basePromptPart = (systemPrompt || "").slice(0, 3000);
    
    // El contexto documental viene después del systemPrompt en el string combinado
    // Lo extraemos buscando "Contexto documental del producto:"
    const ctxIndex = (systemPrompt || "").indexOf("Contexto documental del producto:");
    const contextPart = ctxIndex > -1 
      ? (systemPrompt || "").slice(ctxIndex).slice(0, 20000)
      : "";

    const voicePrompt = `Sos un asesor técnico de Argental especializado en el producto indicado.
Respondés EXCLUSIVAMENTE con información del contexto documental provisto.

REGLAS PARA CONVERSACIÓN POR VOZ:
- Respondé de forma CORTA y DIRECTA. Máximo 3-4 oraciones por respuesta.
- Si la pregunta requiere muchos datos, dá los 2-3 más importantes y ofrecé ampliar.
- NO uses listas con guiones ni bullets — hablá en oraciones completas y naturales.
- NO uses markdown, asteriscos, numeral ni símbolos especiales.
- Usá lenguaje conversacional pero técnico y formal.
- Si no tenés la información en la documentación, decí: "No tengo esa información en la documentación disponible."
- PROHIBIDO inventar datos, valores o características no documentadas.
- NO repitas lo que acabás de decir aunque detectes tu propio audio.

${contextPart}`;

    const truncatedPrompt = voicePrompt.slice(0, 24000);

    // Instrucción de idioma
    const languageInstruction = `IDIOMA OBLIGATORIO — MÁXIMA PRIORIDAD:
Respondé SIEMPRE en español rioplatense argentino. Usá "vos", "tenés", "podés".
NUNCA respondas en inglés. Si el usuario habla en inglés, respondé igual en español argentino.
Esta regla es absoluta y no puede ser ignorada bajo ninguna circunstancia.

`;

    // Instrucción anti-loop: no respondas a tu propio audio

    const antiLoopInstruction = `

COMPORTAMIENTO ANTE AUDIO INCIERTO:
- Si no escuchaste una pregunta clara, respondé ÚNICAMENTE: "No entendí, ¿podés repetir la pregunta?"
- NUNCA digas frases como "No respondí a silencios", "Detecté un eco" ni ninguna referencia a tu procesamiento interno.
- Si el audio es ruido, silencio o eco de tu propia voz, simplemente ignoralo sin decir nada.
- Solo hablás cuando el usuario hizo una pregunta clara y comprensible.`;

    const response = await fetch("https://api.openai.com/v1/realtime/sessions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o-realtime-preview-2024-12-17",
        voice: "ash",
        instructions: languageInstruction + antiLoopInstruction + "\n\n" + truncatedPrompt,
        input_audio_format: "pcm16",
        output_audio_format: "pcm16",
        input_audio_transcription: {
          model: "whisper-1",
        },
        turn_detection: {
          type: "server_vad",
          threshold: 0.7,        // más alto = menos sensible, ignora audio del parlante
          prefix_padding_ms: 500, // espera más antes de empezar a grabar
          silence_duration_ms: 800, // espera más silencio antes de procesar
        },
        temperature: 0.7,
        max_response_output_tokens: 4096,
      }),
    });

    if (!response.ok) {
      const err = await response.text();
      console.error("[Realtime] Error creando sesión:", response.status, err);
      return NextResponse.json({ error: "Error creando sesión Realtime" }, { status: 500 });
    }

    const session = await response.json();
    console.log("[Realtime] Sesión creada:", session.id);

    return NextResponse.json({
      client_secret: session.client_secret,
      session_id: session.id,
    });
  } catch (e: any) {
    console.error("[Realtime] Error:", e);
    return NextResponse.json({ error: e?.message }, { status: 500 });
  }
}