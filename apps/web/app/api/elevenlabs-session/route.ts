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

    // ── Reemplazar FE por "Ford Export" en el contexto antes de enviarlo al LLM ──
    // Así el LLM nunca ve "FE" y naturalmente lo repite como "Ford Export"
   // ── Reemplazar FE por texto fonético en el contexto antes de enviarlo al LLM ──
   // ── Reemplazar FE por texto fonético en el contexto antes de enviarlo al LLM ──
    contextPart = contextPart
      .replace(/\bFE4\.0-960 BIO\b/g, "Ford Export cuatro punto cero novecientos sesenta Bio")
      .replace(/\bFE4\.0-472 BIO\b/g, "Ford Export cuatro punto cero cuatrocientos setenta y dos Bio")
      .replace(/\bFE4\.0-960\b/g, "Ford Export cuatro punto cero novecientos sesenta")
      .replace(/\bFE4\.0-472\b/g, "Ford Export cuatro punto cero cuatrocientos setenta y dos")
      .replace(/\bFE III-315 PISO\b/g, "Ford Export tres quince piso")
      .replace(/\bFE III-315 CAMARA\b/g, "Ford Export tres quince cámara")
      .replace(/\bFE III-315\b/g, "Ford Export tres quince")
      .replace(/\bFE960\b/g, "Ford Export novecientos sesenta")
      .replace(/\bFE\b/g, "Ford Export");

    // Segunda pasada — por si el contexto ya tiene "Ford Export 4.0-960" sin prefijo FE
    contextPart = contextPart
      .replace(/Ford Export 4\.0-960 BIO/g, "Ford Export cuatro punto cero novecientos sesenta Bio")
      .replace(/Ford Export 4\.0-472 BIO/g, "Ford Export cuatro punto cero cuatrocientos setenta y dos Bio")
      .replace(/Ford Export 4\.0-960/g, "Ford Export cuatro punto cero novecientos sesenta")
      .replace(/Ford Export 4\.0-472/g, "Ford Export cuatro punto cero cuatrocientos setenta y dos")
      .replace(/Ford Export III-315 PISO/g, "Ford Export tres quince piso")
      .replace(/Ford Export III-315 CAMARA/g, "Ford Export tres quince cámara")
      .replace(/Ford Export III-315/g, "Ford Export tres quince")
      .replace(/Ford Export 960/g, "Ford Export novecientos sesenta");

    console.log("[ElevenLabs] ctx total:", ctxLength, "chars — enviando:", contextPart.length, "chars");

    const firstLine = contextPart.split("\n")[0].slice(0, 200)
      .replace(/Ford Export 4\.0-960 BIO/g, "Ford Export cuatro punto cero novecientos sesenta Bio")
      .replace(/Ford Export 4\.0-472 BIO/g, "Ford Export cuatro punto cero cuatrocientos setenta y dos Bio")
      .replace(/Ford Export 4\.0-960/g, "Ford Export cuatro punto cero novecientos sesenta")
      .replace(/Ford Export 4\.0-472/g, "Ford Export cuatro punto cero cuatrocientos setenta y dos");

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
- Ford Export 960 → "Ford Export novecientos sesenta"
- Ford Export 4.0-960 → "Ford Export cuatro punto cero novecientos sesenta"
- Ford Export 4.0-472 → "Ford Export cuatro punto cero cuatrocientos setenta y dos"
- Ford Export 4.0-960 BIO → "Ford Export cuatro punto cero novecientos sesenta Bio"
- Ford Export 4.0-472 BIO → "Ford Export cuatro punto cero cuatrocientos setenta y dos Bio"
- Ford Export III-315 → "Ford Export tres quince"
- Ford Export III-315 PISO → "Ford Export tres quince piso"
- Ford Export III-315 CAMARA → "Ford Export tres quince cámara"
- MBE-80U-S → "Eme Be E ochenta U ese"
- MBE-80S → "Eme Be E ochenta ese"
- MBE-200U-S → "Eme Be E doscientos U ese"
- MBE-160HA → "Eme Be E ciento sesenta H A"
- MBE-40T → "Eme Be E cuarenta T"
- PA340 → "Panier tres cuarenta y cinco por setenta"
- PA390 → "Panier tres setenta noventa"
- PA250 → "Panier doscientos cincuenta"
- GT-38 → "G T treinta y ocho"
- GT-MINI → "G T mini"
- GT-PANIER → "G T Panier"
- GTC → "G T C"
- GTCG → "G T C G"
- SGAU → "S G A U setenta noventa o sesenta ochenta"
- SGAUG → "S G A U G"
- SGGPM → "S G G P M"
- SP-MODULAR → "S P modular"
- EU2C → "E U dos C"
- DBS → "D B S treinta cien treinta"
- DBSA → "D B S A treinta cuarenta ciento treinta y cinco"
- DB → "D B mil"
- DB1000 → "D B mil"
- DB1200 → "D B mil doscientos"
- DB4B → "D B cuatro bocas"
- DB2B → "D B dos bocas"
- DBT40-140 → "D B T cuarenta ciento cuarenta"
- CFA → "C F A dos, cuatro o seis carros setenta por noventa"
- CFC-40B → "C F C cuarenta B Panier"
- CFC-Vision-40B → "Vision"
- HCI-500 → "H C I quinientos"
- H2C → "H dos C"
- H3C3.7 → "H tres C tres punto siete"
- TSI → "T S I"
- BPNS-20L → "B P N S veinte L"
- BPNS-40L → "B P N S cuarenta L"
- BPNV-300 → "Bizcomatica B P N V trescientos"
- LPN-520S → "Laminadora de mesa L P N quinientos veinte S"
- LPN-600 → "L P N seiscientos"
- SPN-600 → "S P N seiscientos"
- SPNI-500 → "Sobadora pastelera S P N I quinientos"
- BC1200I → "B C mil doscientos I"
- ARD6I → "A R D seis I"
- ARD6I-MOD → "A R D seis I modular"
- FDPM → "F D P M"
- MP-1I → "M P uno I"
- DPN-2232 → "D P N veintidós treinta y dos"
- RPNM → "R P N M"
- RPNM-RPN → "R P N M doce"
- FMI-10 → "F M I diez"
- FMI-10-12 → "F M I diez doce"
- GP70-I → "G P setenta I"
- BHC → "B H C"
- 360-BE → "S A trescientos sesenta B E"
- C4000 → "C cuatro mil"
- C12000 → "C doce mil"
- ARM-4000 → "Cabezal Armador cuatro mil"
- RAPIFREDDO → "Rapifreddo"
- RAPIFREDDO-T5 → "Rapifreddo T cinco"
- RAPIFREDDO-15 → "Rapifreddo V quince"
- RAPIFREDDO-30 → "Rapifreddo T treinta"
- RAPIFREDDO-V15.2 → "Rapifreddo V quince punto dos"
- DOS-AR → "Dos Ar"
- M-66 → "M sesenta y seis I"
- A-60 → "A sesenta"
- A-160 → "A ciento sesenta"
- MIX-60 → "Mix sesenta"
- RA12-PACK → "R A doce Pack"
- ESCAMA-1.0 → "Escama uno punto cero"
- GALILEO → "Sistema Galileo"
- GALILEO-ARTESAN → "Galileo Artesano"
- TORNADO-PL → "Tornado Plus E"
- TORNADO-PL-II → "Tornado Plus E dos"
- BLIND-LI-FULL → "Blindi Full"
- COMPRESSLINE → "Compressline"
- LINEA-CIABATTA → "Línea Ciabatta"
- FOGLIA → "Foglia"
- CORBOLI → "Corboli"
- ELEVA → "Elevador T ciento sesenta H"
- NATO → "Nato"
- MINICONV → "Mini Conv"
- HORECA → "Horeca"
- HORECA-XL → "Horeca X L"
- BRISEELINE → "Briseeline"
- DOSIF-RELLENO → "Dosificador de Rellenos"
- DOSIF-X5 → "Dosificadora multiple por cinco"
- CHOPRA-III → "Chopra tres"
- LINEA-PIZZAS → "Línea Pizza"
- LINEA-EMPANADAS → "Línea Empanadas Compac"
- LIDO → "Lido"
- TRANSP-BARRAS → "Transportador inclinado de Barras"
- INSIGNIA → "Insignia"
- AMBRO-PRESS → "Ambro Press"
- Venecia → "Venecia"
- MT-MODULAR → "Mesa de Trabajo Modular"
- PORTO-20 → "Porto veinte"
- PORTO-40 → "Porto cuarenta"
- PORTO-80 → "Porto ochenta"
- ARTESAN → "Artesan"
- LANIN-II → "Lanín dos"
- PITA → "Pita"
- AR-350 → "A R trescientos cincuenta"
- BATA → "Bata"
- MINI-LINEA-COORD → "Mini Línea con estibador coordinado"
- MINI-LINEA-RETRAC → "Mini Línea con estibador retráctil"

FORMATO DE TEXTO EN RESPUESTAS:
Aunque pronuncies los códigos de forma oral, SIEMPRE escribilos en formato estándar:
- Modelos FE: escribí "Ford Export 4.0-960", "Ford Export III-315"
- Otros modelos: escribí "MBE-80U-S", "PA340"
- Teléfonos: escribí "+5493415470737"
- Medidas: escribí "760 mm", "210°C", "4.72 m²"

LONGITUD DE RESPUESTAS — OBLIGATORIO:
Respondé de forma CORTA y DIRECTA. Máximo 3-4 oraciones por respuesta.
Respondé EXACTAMENTE lo que te preguntaron, sin agregar información extra no solicitada.
PROHIBIDO PREGUNTAR: Nunca hagas preguntas al usuario al final de tu respuesta. No ofrezcas ampliar, no preguntes si quiere más info, no sugieras temas relacionados. Simplemente respondé lo que te preguntaron y terminá.
Si la pregunta es simple, la respuesta debe ser simple.
Solo extendete si el usuario pide explícitamente más detalle.

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