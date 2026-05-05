// backend/api/voice-chat.js
import { OpenAI } from "openai";
import { toFile } from "openai";
import multer from "multer";
import { AGENTS_BASE } from "../../apps/web/lib/agents.js";

// === Configuración de subida de audio ===
const upload = multer({ storage: multer.memoryStorage() });

// Cliente OpenAI
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// === Mismo procesamiento de contexto que usa /api/chat ===
function sanitizeRaw(txt) {
  if (!txt) return "";
  txt = txt.replace(/-\s*\n\s*/g, "");
  txt = txt.replace(/\r/g, "").replace(/\t/g, " ").replace(/[ \u00A0]{2,}/g, " ");
  txt = txt.replace(/\n{3,}/g, "\n\n");
  txt = txt.replace(/\s+([,.;:!?])/g, "$1");
  txt = txt.replace(/[^\w\sÁÉÍÓÚÜÑáéíóúüñ°%/().,:;+-]{2,}/g, " ");
  return txt.trim();
}

function splitSentences(text) {
  return text
    .split(/(?<=\.)\s+|\n+/g)
    .map((s) => s.trim())
    .filter(Boolean);
}

function qualityScore(s) {
  const len = s.length;
  const vowels = (s.match(/[aeiouáéíóúü]/gi) || []).length;
  return len >= 30 && len <= 500 && vowels > 10 ? 1 : 0;
}

function buildFocusedContext(raw, maxChars = 90000) {
  const cleaned = sanitizeRaw(raw);
  const parts = splitSentences(cleaned).filter((s) => qualityScore(s) > 0);
  return parts.join(" ").slice(0, maxChars);
}

// === Mismo TEXT_STYLE que usa /api/chat ===
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

export default async function handler(req, res) {
  // CORS
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, X-Session-Id");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") {
    return res.status(405).json({ ok: false, error: "Método no permitido" });
  }

  try {
    // 1) Procesar multipart
    await new Promise((resolve, reject) => {
      upload.single("audio")(req, res, (err) =>
        err ? reject(err) : resolve()
      );
    });

    const audioFile = req.file;
    const { agentId, context, systemPrompt } = req.body || {};

    console.log("[/voice-chat] Request recibido:", {
      hasFile: !!audioFile,
      agentId,
      mimetype: audioFile?.mimetype,
      size: audioFile?.size,
      contextLen: (context || "").length,
      systemPromptLen: (systemPrompt || "").length,
    });

    if (!audioFile) {
      return res.status(400).json({ ok: false, error: "No se recibió archivo de audio" });
    }

    if (!process.env.OPENAI_API_KEY) {
      return res.status(500).json({ ok: false, error: "OPENAI_API_KEY no configurada" });
    }

    const agent = AGENTS_BASE.find((a) => a.id === agentId);
    if (!agent) {
      return res.status(400).json({ ok: false, error: "Agente inválido" });
    }

    /* 2) Transcribir con Whisper */
    console.log("[/voice-chat] Transcribiendo audio...");

    const transcription = await openai.audio.transcriptions.create({
      file: await toFile(audioFile.buffer, audioFile.originalname || "audio.webm", {
        type: audioFile.mimetype || "audio/webm",
      }),
      model: "whisper-1",
      language: "es",
    });

    const question = (transcription.text || "").trim();
    console.log("[/voice-chat] ✅ Transcripción:", { textPreview: question.slice(0, 80), length: question.length });

    if (!question) {
      return res.status(500).json({ ok: false, error: "No se pudo obtener texto de la transcripción." });
    }

    /* 3) Construir system prompt igual que /api/chat */
    const finalSystemPrompt = systemPrompt || agent.systemPrompt || "";
    const focusedContext = buildFocusedContext(context || "");

    console.log("[/voice-chat] Contexto procesado:", {
      contextRawLen: (context || "").length,
      contextFocusedLen: focusedContext.length,
    });

    const systemContent = [
      finalSystemPrompt.trim(),
      TEXT_STYLE,
      "Contexto documental relevante:",
      focusedContext || "(vacío)",
    ].join("\n\n");

    /* 4) Llamar a OpenAI directamente (sin pasar por /api/chat) */
    console.log("[/voice-chat] Llamando a OpenAI directamente...");

    const completion = await openai.chat.completions.create({
      model: "gpt-4.1",
      temperature: 0.2,
      stream: false,
      messages: [
        { role: "system", content: systemContent },
        { role: "user", content: question },
      ],
    });

    const answer = completion.choices?.[0]?.message?.content?.trim() || "";

    console.log("[/voice-chat] ✅ Respuesta final:", {
      preview: answer.slice(0, 120),
      length: answer.length,
    });

    if (!answer) {
      return res.status(500).json({ ok: false, error: "El modelo no devolvió respuesta." });
    }

    return res.status(200).json({
      ok: true,
      question,
      answer,
    });

  } catch (e) {
    console.error("❌ Error en voice-chat:", e);
    return res.status(500).json({ ok: false, error: e.message });
  }
}