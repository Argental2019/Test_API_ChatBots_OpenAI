// apps/web/app/api/realtime/route.ts
import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  try {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: "OPENAI_API_KEY no configurada" }, { status: 500 });
    }

    const { systemPrompt } = await req.json();

    // Extraer contexto documental
    const ctxIndex = (systemPrompt || "").indexOf("Contexto documental del producto:");
    const fullCtx = ctxIndex > -1 ? (systemPrompt || "").slice(ctxIndex) : "";
let contextPart = "";

if (fullCtx.length <= 50000) {
  contextPart = fullCtx;
} else {
  // Inicio (25k) + sección pan francés/producción (25k)
  const start = fullCtx.slice(0, 25000);
  const keywords = ["pan francés", "producción", "kg/h", "kg por hora", "capacidad", "bandejas"];
  let bestIdx = Math.floor(fullCtx.length * 0.5);
  for (const kw of keywords) {
    const idx = fullCtx.toLowerCase().indexOf(kw, 20000);
    if (idx > 0 && idx < fullCtx.length * 0.9) {
      bestIdx = Math.max(20000, idx - 2000);
      break;
    }
  }
  const middle = fullCtx.slice(bestIdx, bestIdx + 25000);
  contextPart = `${start}\n\n[...]\n\n${middle}`;
}

    const firstLine = contextPart.split("\n")[0].slice(0, 200);

    console.log("[Realtime] systemPrompt total chars:", (systemPrompt || "").length, "— contexto enviado:", contextPart.length);
    const kgIdx = (systemPrompt || "").toLowerCase().indexOf("kg/h");
console.log("[Realtime] Primera aparición kg/h en char:", kgIdx, "de", (systemPrompt||"").length);
const panIdx = (systemPrompt || "").toLowerCase().indexOf("pan francés");
console.log("[Realtime] Primera aparición 'pan francés' en char:", panIdx);
    const voicePrompt = `IDIOMA: Respondé SIEMPRE en español rioplatense argentino. Usá "vos", "tenés", "podés". NUNCA en inglés.

ROL: Sos un asesor técnico de Argental para: ${firstLine}
Respondés SOLO con información del contexto documental provisto abajo.
PROHIBIDO inventar datos. Si no está en el contexto decí: "No tengo esa información en la documentación disponible."

CONTACTO: Si preguntan por compra, posventa o repuestos, pronunciá EXACTAMENTE estas palabras en este orden: "más cinco cuatro nueve tres cuatro uno cinco cuatro siete cero siete tres siete". Son catorce palabras. Contálas: más(1) cinco(2) cuatro(3) nueve(4) tres(5) cuatro(6) uno(7) cinco(8) cuatro(9) siete(10) cero(11) siete(12) tres(13) siete(14). PROHIBIDO omitir ninguna palabra. PROHIBIDO decir "son catorce palabras" ni mencionar el conteo en voz alta. Al escribir en el chat usá siempre el formato: +5493415470737
PRONUNCIACIÓN DE MODELOS:
FE960/FE4.0-960=Efe E cuatro punto cero novecientos sesenta, FE4.0-472=Efe E cuatro punto cero cuatrocientos setenta y dos, FE III-315=Efe E tres quince, MBE-80=Eme Be E ochenta, MBE-200=Eme Be E doscientos, MBE-160HA=Eme Be E ciento sesenta H A, PA340=Panier tres cuarenta, PA390=Panier tres noventa, GT-38=G T treinta y ocho, GT-MINI=G T mini, GTC=G T C, SGAU=S G A U, EU2C=E U dos C, DBS=D B S, DB1000=D B mil, DB1200=D B mil doscientos, CFA=C F A, HCI-500=H C I quinientos, H2C=H dos C, TSI=T S I, C4000=C cuatro mil, C12000=C doce mil, ARM-4000=Cabezal Armador cuatro mil, RAPIFREDDO=Rapifreddo.

MEDIDAS: mm=milímetros, cm=centímetros, m=metros, m²=metros cuadrados, kg=kilos, kg/h=kilos por hora (140 kg/h = ciento cuarenta kilos por hora), kW=kilowatts, °C=grados, V=volts, Hz=hertz. Números completos en palabras: 1355=mil trescientos cincuenta y cinco.

VOZ: Oraciones completas y naturales. Sin listas, bullets, markdown ni símbolos. Si no escuchaste bien: "No entendí, ¿podés repetir?" Si hay ruido o silencio, ignoralo.

${contextPart}`;

    const finalPrompt = voicePrompt.slice(0, 60000);

    console.log("[Realtime] prompt final length:", finalPrompt.length);

    const response = await fetch("https://api.openai.com/v1/realtime/sessions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o-realtime-preview-2024-12-17",
        voice: "ash",
        modalities: ["audio", "text"],
        instructions: finalPrompt,
        input_audio_format: "pcm16",
        output_audio_format: "pcm16",
        input_audio_transcription: { model: "whisper-1" },
        turn_detection: {
          type: "server_vad",
          threshold: 0.7,
          prefix_padding_ms: 500,
          silence_duration_ms: 800,
        },
        temperature: 0.6,
        max_response_output_tokens: 1024,
      }),
    });

    if (!response.ok) {
      const err = await response.text();
      console.error("[Realtime] Error creando sesión:", response.status, err);
      return NextResponse.json({ error: "Error creando sesión Realtime" }, { status: 500 });
    }

    const session = await response.json();
    console.log("[Realtime] Sesión creada:", session.id, "— prompt:", finalPrompt.length, "chars");

    return NextResponse.json({
      client_secret: session.client_secret,
      session_id: session.id,
    });

  } catch (e: any) {
    console.error("[Realtime] Error:", e);
    return NextResponse.json({ error: e?.message }, { status: 500 });
  }
}