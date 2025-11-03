import { NextRequest } from "next/server";

export const runtime = "edge";

/* ======================
   1) LIMPIEZA AGRESIVA
   ====================== */
function sanitizeRaw(txt: string) {
  if (!txt) return "";
  // Une palabras cortadas por guión: "instala-\nción" → "instalación"
  txt = txt.replace(/-\s*\n\s*/g, "");
  // Normaliza saltos/espacios
  txt = txt.replace(/\r/g, "").replace(/\t/g, " ").replace(/[ \u00A0]{2,}/g, " ");
  // Colapsa saltos múltiples
  txt = txt.replace(/\n{3,}/g, "\n\n");
  // "m m" → "mm"
  txt = txt.replace(/(\d)\s*m\s*m\b/gi, "$1 mm");
  // Ø  5 / 8 → Ø 5/8
  txt = txt.replace(/Ø\s+(\d)\s*\/\s*(\d)/g, "Ø $1/$2");
  // 1 / 2” → 1/2”
  txt = txt.replace(/(\d)\s*\/\s*(\d)\s*”/g, "$1/$2”");
  // Espacios antes de puntuación → limpiarlos
  txt = txt.replace(/\s+([,.;:!?])/g, "$1");
  // Quita secuencias de símbolos basura largas
  txt = txt.replace(/[^\w\sÁÉÍÓÚÜÑáéíóúüñ°%/().,:;+-]{2,}/g, " ");
  return txt.trim();
}

/* ===========================================
   2) SEGMENTACIÓN + FILTRO DE CALIDAD & INTENT
   =========================================== */
function splitSentences(text: string): string[] {
  // Segmentador simple por puntos/quiebres
  const parts = text
    .split(/(?<=\.)\s+|\n+/g)
    .map(s => s.trim())
    .filter(Boolean);
  return parts;
}

function qualityScore(s: string) {
  // Heurística: penaliza basura (demasiados símbolos, pocas vocales, frases muy cortas o muy largas)
  const len = s.length;
  const nonWord = (s.match(/[^\w\sÁÉÍÓÚÜÑáéíóúüñ°%/().,:;+-]/g) || []).length;
  const vowels = (s.match(/[aeiouáéíóúü]/gi) || []).length;
  let score = 0;
  if (len >= 30 && len <= 400) score += 2;
  score += Math.max(0, 10 - nonWord);       // menos símbolos = mejor
  score += Math.min(10, Math.floor(vowels / 3)); // más vocales = más “español”
  if (/[.?!]$/.test(s)) score += 1;
  return score;
}

function normalizeTokens(s: string) {
  return (s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, ""))
    .replace(/[^a-z0-9\s/°%.-]/g, " ")
    .split(/\s+/)
    .filter(w => w && w.length > 2 && !STOP.has(w));
}
const STOP = new Set([
  "los","las","una","uno","unos","unas","que","para","con","sin","del","por","sus","sus","muy","más","menos",
  "este","esta","estos","estas","de","el","la","y","o","u","en","al","lo","se","es","son","ser","hay","como",
  "si","no","un","una","su","sus","ya","a","the","and","or","of"
]);

function relevanceScore(sentence: string, query: string) {
  const q = normalizeTokens(query);
  if (!q.length) return 0;
  const s = normalizeTokens(sentence);
  if (!s.length) return 0;
  let overlap = 0;
  const set = new Set(s);
  for (const t of q) if (set.has(t)) overlap++;
  return overlap;
}

function buildFocusedContext(raw: string, userQuestion: string, maxChars = 80_000) {
  const cleaned = sanitizeRaw(raw);
  const sentences = splitSentences(cleaned);
  // Puntuar por calidad + relevancia
  const scored = sentences.map(s => ({
    s,
    q: qualityScore(s),
    r: relevanceScore(s, userQuestion)
  }));
  // descarta basura evidente
  const filtered = scored.filter(x => x.q >= 8);
  // ordena por relevancia primero, luego calidad
  filtered.sort((a, b) => (b.r - a.r) || (b.q - a.q));
  // toma las mejores oraciones (p. ej., 300) y corta por tamaño
  const picked: string[] = [];
  let acc = 0;
  for (const it of filtered.slice(0, 300)) {
    if (acc + it.s.length + 1 > maxChars) break;
    picked.push(it.s);
    acc += it.s.length + 1;
  }
  // si quedó muy poco (pregunta muy general), cae a top calidad
  if (picked.length < 10) {
    const byQuality = scored.sort((a, b) => b.q - a.q).slice(0, 300).map(x => x.s);
    return byQuality.join("\n");
  }
  return picked.join("\n");
}

/* ===========================================
   3) INSTRUCCIONES DE ESTILO (GENÉRICAS)
   =========================================== */
const INSTRUCTIONS = `
REGLAS (obligatorio):
- Español claro y profesional. Reescribí con tus palabras; no copies texto dañado.
- Basate SOLO en el contexto provisto. Si un dato no está, escribí **"No especificado"**.
- Si el texto de contexto parece corrupto, ignorá esos fragmentos y priorizá partes coherentes.
- No muestres nombres/IDs de archivos ni rutas.

FORMATO:
- Si el usuario pide pasos → entregá una **guía paso a paso** (lista numerada) y una sección "Notas".
- Si pide parámetros/requisitos → entregá una **tabla** con columnas (Parámetro | Valor | Unidad | Observaciones).
- En el resto de los casos → **resumen** en bullets, más “Requisitos / Limitaciones” y “Buenas prácticas”.
`.trim();

export async function POST(req: NextRequest) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return new Response("Missing OPENAI_API_KEY", { status: 500 });

  const { messages, systemPrompt, context } = await req.json();

  // Última pregunta del usuario (para enfocar)
  const lastUser = Array.isArray(messages)
    ? [...messages].reverse().find((m: any) => m?.role === "user")?.content || ""
    : "";

  // 1) Construí un contexto ENFOCADO (limpio + relevante)
  const FOCUSED = buildFocusedContext(String(context || ""), String(lastUser || ""), 80_000);

  // 2) System final
  const sys = {
    role: "system" as const,
    content: [
      String(systemPrompt || "").trim(),
      INSTRUCTIONS,
      "Contexto documental (limpio y filtrado por relevancia):",
      FOCUSED || "(vacío)"
    ].join("\n\n"),
  };

  const payload = {
    model: "gpt-4o-mini",
    temperature: 0.1,
    stream: true,
    // max_tokens: 900, // opcional para acotar salida
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
