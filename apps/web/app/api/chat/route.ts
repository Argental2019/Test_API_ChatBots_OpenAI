// apps\web\app\api\chat\route.ts
import { NextRequest } from "next/server";

export const runtime = "edge";

/* === 1. Limpieza básica === */
function sanitizeRaw(txt: string) {
  if (!txt) return "";
  txt = txt.replace(/-\s*\n\s*/g, "");
  txt = txt.replace(/\r/g, "").replace(/\t/g, " ").replace(/[ \u00A0]{2,}/g, " ");
  txt = txt.replace(/\n{3,}/g, "\n\n");
  txt = txt.replace(/\s+([,.;:!?])/g, "$1");
  txt = txt.replace(/[^\w\sÁÉÍÓÚÜÑáéíóúüñ°%/().,:;+-]{2,}/g, " ");
  return txt.trim();
}

/* === 2. Contexto relevante === */
function splitSentences(text: string): string[] {
  return text
    .split(/(?<=\.)\s+|\n+/g)
    .map((s) => s.trim())
    .filter(Boolean);
}

function qualityScore(s: string) {
  const len = s.length;
  const vowels = (s.match(/[aeiouáéíóúü]/gi) || []).length;
  return len >= 30 && len <= 500 && vowels > 10 ? 1 : 0;
}

function buildFocusedContext(raw: string, userQuestion: string, maxChars = 90_000) {
  const cleaned = sanitizeRaw(raw);
  const parts = splitSentences(cleaned).filter((s) => qualityScore(s) > 0);
  return parts.join(" ").slice(0, maxChars);
}

/* === 3. Formato narrativo sin Markdown === */
const TEXT_STYLE = `
FORMATO DE SALIDA (OBLIGATORIO):
- No uses símbolos de formato Markdown (#, *, **, ---).
- Escribí en texto plano con secciones numeradas y subtítulos en mayúsculas.
- Ejemplo de formato:

El horno rotativo Argental FE 4.0-960 se destaca por su rendimiento, durabilidad y eficiencia energética. A continuación, se detallan las principales características:

1. ALTA VERSATILIDAD Y HOMOGENEIDAD DE COCCIÓN
Permite cocinar una amplia variedad de productos, asegurando cocciones parejas en todas las bandejas.

2. EFICIENCIA ENERGÉTICA Y DURABILIDAD
Incluye una aislación térmica que reduce el consumo y prolonga la vida útil del equipo.

3. TECNOLOGÍA Y CONTROL
Panel táctil programable con múltiples etapas de cocción, conectividad remota y supervisión en tiempo real.

4. SOPORTE Y GARANTÍA
Repuestos originales garantizados por 10 años y asistencia técnica directa desde fábrica.

Al final, incluí un breve resumen en tono profesional que refuerce los beneficios para el usuario.
`.trim();

/* === 4. Handler === */
export async function POST(req: NextRequest) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return new Response("Missing OPENAI_API_KEY", { status: 500 });

  const { messages, systemPrompt, context } = await req.json();
  const lastUser = Array.isArray(messages)
    ? [...messages].reverse().find((m: any) => m?.role === "user")?.content || ""
    : "";

  const FOCUSED = buildFocusedContext(String(context || ""), String(lastUser || ""), 90_000);

  const sys = {
    role: "system" as const,
    content: [
      String(systemPrompt || "").trim(),
      TEXT_STYLE,
      "Contexto documental relevante:",
      FOCUSED || "(vacío)",
    ].join("\n\n"),
  };

  const payload = {
    model: "gpt-5.1",
    temperature: 0.2,
    stream: true,
    response_format: { type: "text" },
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

  return new Response(r.body, {
    status: 200,
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-store",
    },
  });
}
