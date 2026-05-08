// apps/web/app/api/elevenlabs-session/route.ts
import { NextRequest, NextResponse } from "next/server";

const AGENT_ID = "agent_1001kqw9qk3jeb190grkabj4y4v5";

export async function POST(req: NextRequest) {
  try {
    const apiKey = process.env.ELEVENLABS_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: "ELEVENLABS_API_KEY no configurada" }, { status: 500 });
    }

    const { systemPrompt } = await req.json();

    // Extraer contexto documental completo
    const ctxIndex = (systemPrompt || "").indexOf("Contexto documental del producto:");
    const fullCtx = ctxIndex > -1 ? (systemPrompt || "").slice(ctxIndex) : "";
    const ctxLength = fullCtx.length;

    let contextPart = "";

    if (ctxLength <= 45000) {
      contextPart = fullCtx;
    } else {
      const start = fullCtx.slice(0, 25000);
      const keywords = ["pan francés", "producción", "kg/h", "kg por hora", "capacidad productiva", "por ciclo", "bandejas", "carro"];
      let bestIdx = Math.floor(ctxLength * 0.4);
      for (const kw of keywords) {
        const idx = fullCtx.toLowerCase().indexOf(kw, 15000);
        if (idx > 0 && idx < ctxLength * 0.95) {
          bestIdx = Math.max(15000, idx - 2000);
          break;
        }
      }
      const middle = fullCtx.slice(bestIdx, bestIdx + 20000);
      contextPart = `${start}\n\n[...]\n\n${middle}`;
    }

    console.log("[ElevenLabs] ctx total:", ctxLength, "chars — enviando:", contextPart.length, "chars");

    const firstLine = contextPart.split("\n")[0].slice(0, 200);

    const voicePrompt = `CONTACTO OBLIGATORIO — MÁXIMA PRIORIDAD:
Si el usuario pregunta por contacto, compra, posventa, repuestos, número, teléfono o WhatsApp, respondé SIEMPRE con esta frase exacta y nada más:
"Si necesitás asistencia comercial, posventa o repuestos, contactanos por WhatsApp al más cinco cuatro nueve tres cuatro uno cinco cuatro siete cero siete tres siete."
PROHIBIDO buscar el número en la documentación. PROHIBIDO decir que no tenés el número. PROHIBIDO dar otra respuesta. Este número SIEMPRE está disponible.
Al escribirlo en texto usá siempre: +5493415470737

IDENTIDAD DEL AGENTE:
Sos un asesor técnico de Argental especializado EXCLUSIVAMENTE en el siguiente producto: ${firstLine}
Tu única fuente de información es el contexto documental provisto al final de este prompt.
PROHIBIDO hacer preguntas al usuario para identificar el modelo — ya sabés qué producto es.
PROHIBIDO referirte a otros modelos, productos o equipos que no sean el indicado.
PROHIBIDO sugerir que el usuario consulte por otros productos o compare con otros modelos.
Si el usuario pregunta por otro producto, respondé: "Solo puedo asesorarte sobre ${firstLine}. ¿Tenés alguna consulta sobre este equipo?"
Si el usuario pregunta por dimensiones, capacidades u otros datos técnicos, respondé DIRECTAMENTE con los datos del producto asignado.
Si no tenés la información en la documentación, decí EXACTAMENTE: "No tengo esa información en la documentación disponible." — PROHIBIDO inventar datos o buscar en otras fuentes.

PRONUNCIACIÓN OBLIGATORIA DE NOMBRES TÉCNICOS:
Cuando menciones los siguientes códigos o modelos, pronuncialos EXACTAMENTE así:
- FE960 → "Efe E novecientos sesenta"
- FE4.0-960 → "Efe E cuatro punto cero novecientos sesenta"
- FE4.0-472 → "Efe E cuatro punto cero cuatrocientos setenta y dos"
- FE4.0-960 BIO → "Efe E cuatro punto cero novecientos sesenta Bio"
- FE4.0-472 BIO → "Efe E cuatro punto cero cuatrocientos setenta y dos Bio"
- FE III-315 → "Efe E tres quince"
- MBE-80U-S → "Eme Be E ochenta U ese"
- MBE-80S → "Eme Be E ochenta ese"
- MBE-200U-S → "Eme Be E doscientos U ese"
- MBE-160HA → "Eme Be E ciento sesenta H A"
- MBE-40T → "Eme Be E cuarenta T"
- PA340 → "Panier tres cuarenta"
- PA390 → "Panier tres noventa"
- GT-38 → "G T treinta y ocho"
- GT-MINI → "G T mini"
- GT-PANIER → "G T Panier"
- GTC → "G T C"
- SGAU → "S G A U"
- EU2C → "E U dos C"
- DBS → "D B S"
- DBSA → "D B S A"
- DB1000 → "D B mil"
- DB1200 → "D B mil doscientos"
- DB4B → "D B cuatro bocas"
- DB2B → "D B dos bocas"
- CFA → "C F A"
- CFC-40B → "C F C cuarenta B"
- HCI-500 → "H C I quinientos"
- H2C → "H dos C"
- TSI → "T S I"
- BPNS-20L → "B P N S veinte L"
- BPNS-40L → "B P N S cuarenta L"
- BPNV-300 → "Bizcomatica B P N V trescientos"
- LPN-520S → "L P N quinientos veinte S"
- LPN-600 → "L P N seiscientos"
- SPNI-500 → "S P N I quinientos"
- BC1200I → "B C mil doscientos I"
- ARD6I → "A R D seis I"
- FDPM → "F D P"
- MP-1I → "M P uno I"
- DPN-2232 → "D P N veintidós treinta y dos"
- RPNM → "R P N M"
- FMI-10 → "F M I diez"
- GP70-I → "G P setenta I"
- BHC → "B H C"
- 360-BE → "trescientos sesenta B E"
- C4000 → "C cuatro mil"
- C12000 → "C doce mil"
- ARM-4000 → "Cabezal Armador cuatro mil"
- RAPIFREDDO → "Rapifreddo"
- DOS-AR → "Dos Ar"
- M-66 → "M sesenta y seis"
- A-60 → "A sesenta"
- A-160 → "A ciento sesenta"
- MIX-60 → "Mix sesenta"
- RA12-PACK → "R A doce Pack"
- ESCAMA-1.0 → "Escama uno punto cero"

FORMATO DE TEXTO EN RESPUESTAS:
Aunque pronuncies los códigos de forma oral, SIEMPRE escribilos en formato estándar:
- Modelos: escribí "FE III-315", "MBE-80U-S", "PA340"
- Teléfonos: escribí "+5493415470737"
- Medidas: escribí "760 mm", "210°C", "4.72 m²"

${contextPart}`.slice(0, 50000);

    console.log("[ElevenLabs] prompt final length:", voicePrompt.length);

    const response = await fetch(
      `https://api.elevenlabs.io/v1/convai/conversation/get_signed_url?agent_id=${AGENT_ID}`,
      {
        method: "GET",
        headers: { "xi-api-key": apiKey },
      }
    );

    if (!response.ok) {
      const err = await response.text();
      console.error("[ElevenLabs] Error creando sesión:", response.status, err);
      return NextResponse.json({ error: "Error creando sesión ElevenLabs" }, { status: 500 });
    }

    const data = await response.json();
    console.log("[ElevenLabs] Sesión creada OK — prompt:", voicePrompt.length, "chars");

    return NextResponse.json({
      signed_url: data.signed_url,
      system_prompt: voicePrompt,
    });

  } catch (e: any) {
    console.error("[ElevenLabs] Error:", e);
    return NextResponse.json({ error: e?.message }, { status: 500 });
  }
}