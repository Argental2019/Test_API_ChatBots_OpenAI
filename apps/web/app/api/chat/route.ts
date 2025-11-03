import { NextRequest } from "next/server";

export const runtime = "edge";

/* --------- SANEADO DE CONTEXTO (PDFs “sucios”) --------- */
function sanitizeContext(txt: string) {
  if (!txt) return "";
  // Une palabras cortadas por guión de fin de línea: "instala-\nción" → "instalación"
  txt = txt.replace(/-\s*\n\s*/g, "");
  // Normaliza saltos y espacios raros
  txt = txt.replace(/\r/g, "").replace(/\n{3,}/g, "\n\n").replace(/[ \t]{2,}/g, " ");
  // Puntos y comas “bailando”
  txt = txt.replace(/\s+\.\s+/g, ". ").replace(/\s+,\s+/g, ", ");
  // "m m" → "mm"
  txt = txt.replace(/(\d)\s*m\s*m\b/gi, "$1 mm");
  // Ø  5 / 8  → Ø 5/8
  txt = txt.replace(/Ø\s+(\d)\s*\/\s*(\d)/g, "Ø $1/$2");
  // 1 / 2” → 1/2”
  txt = txt.replace(/(\d)\s*\/\s*(\d)\s*”/g, "$1/$2”");
  return txt.trim();
}

/* --------- REGLAS DE SALIDA (GENÉRICAS) --------- */
const GENERIC_FORMAT_RULES = `
REGLAS DE RESPUESTA (obligatorias):
- Respondé en **español** y en **Markdown**.
- Basate **solo** en el contexto provisto. No uses conocimiento externo.
- Si faltan datos, escribí **"No especificado"** (no inventes).
- Convertí unidades a **SI** cuando sea posible (mm, m, kPa, bar, °C). Si ayuda, podés incluir la unidad original entre paréntesis.
- No muestres nombres/IDs de archivos ni rutas de origen.

Elegí **un único layout** según la intención del usuario:

1) Si la consulta es un **procedimiento** → *Guía paso a paso*:
   ### Guía paso a paso
   1. Paso 1: …
   2. Paso 2: …
   **Notas y advertencias** (si aplica)

2) Si la consulta pide **requisitos, parámetros o especificaciones** → *Ficha técnica* (tabla):
   ### Ficha técnica
   | Parámetro | Valor | Unidad | Observaciones |
   |---|---:|:---:|---|
   | … | … | … | … |
   - Cuando no tengas un dato, poné **"No especificado"** en la casilla correspondiente.

3) Para temas **conceptuales o mixtos** → *Resumen ejecutivo*:
   ### Resumen
   - Punto clave 1
   - Punto clave 2
   #### Requisitos / Limitaciones
   - …
   #### Consideraciones / Buenas prácticas
   - …

Si el contexto **no trae evidencia suficiente** para responder, devolvé únicamente:
**"No hay evidencia suficiente en la documentación proporcionada para responder con precisión."**
`.trim();

export async function POST(req: NextRequest) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return new Response("Missing OPENAI_API_KEY", { status: 500 });

  const { messages, systemPrompt, context } = await req.json();

  // 1) Saneá y recortá contexto
  const CLEAN_CONTEXT = sanitizeContext(String(context || "")).slice(0, 100_000);

  // 2) System final con reglas genéricas
  const sys = {
    role: "system" as const,
    content: [
      String(systemPrompt || "").trim(),
      GENERIC_FORMAT_RULES,
      "Contexto documental (consolidado; no exponer nombres de archivos):",
      CLEAN_CONTEXT,
    ].join("\n\n"),
  };

  // 3) Payload (streaming)
  const payload = {
    model: "gpt-4o-mini",
    temperature: 0.1,
    stream: true,
    // Si querés acotar output, habilitá max_tokens (p. ej. 900)
    // max_tokens: 900,
    messages: [sys, ...(Array.isArray(messages) ? messages : [])],
  };

  const r = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(payload),
  });

  if (!r.ok || !r.body) {
    const txt = await r.text().catch(() => "");
    return new Response(txt || "OpenAI error", { status: 500 });
    }

  // 4) Passthrough del stream
  return new Response(r.body, {
    status: 200,
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-store",
    },
  });
}
