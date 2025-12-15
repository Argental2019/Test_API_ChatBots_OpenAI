// backend/api/voice-chat.js
import { OpenAI } from "openai";
import multer from "multer";
import fetch from "node-fetch";
import { AGENTS_BASE } from "../../apps/web/lib/agents.js"; // ajustá extensión/ruta si aplica

// === Configuración de subida de audio ===
const upload = multer({ storage: multer.memoryStorage() });

// Cliente OpenAI
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

/**
 * Limpia tags técnicos para que no se lean por TTS
 */
function cleanForTTS(text) {
  if (!text) return "";
  let cleaned = String(text).replace(/@@META\s*\{[\s\S]*?\}/g, "").trim();
  cleaned = cleaned.replace(/^@@MISS\s*\{[^\n]*\}\s*\n?/m, "").trim();
  return cleaned;
}

/**
 * Helper para parsear stream SSE devuelto por /api/chat (Next)
 * Espera líneas tipo: "data: {...}\n"
 */
async function readSSEStreamToText(stream) {
  if (!stream) return "";

  const decoder = new TextDecoder("utf-8");
  let full = "";
  let buf = "";

  for await (const chunk of stream) {
    buf += decoder.decode(chunk, { stream: true });

    let idx;
    while ((idx = buf.indexOf("\n")) >= 0) {
      const line = buf.slice(0, idx);
      buf = buf.slice(idx + 1);

      const trimmed = line.trim();
      if (!trimmed.startsWith("data:")) continue;

      const data = trimmed.slice(5).trim(); // después de "data:"
      if (!data || data === "[DONE]") continue;

      try {
        const json = JSON.parse(data);
        const delta = json.choices?.[0]?.delta?.content || "";
        if (delta) full += delta;
      } catch (err) {
        // Ignorar líneas no JSON (pueden llegar keep-alive o basura)
        // console.warn("[voice-chat] SSE chunk no JSON:", data);
      }
    }
  }

  // flush final
  decoder.decode();

  return full;
}

export default async function handler(req, res) {
  // CORS (si tu front y back están separados)
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, X-Session-Id");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") {
    return res.status(405).json({ ok: false, error: "Método no permitido" });
  }

  try {
    // 1) Procesar multipart (campo "audio")
    await new Promise((resolve, reject) => {
      upload.single("audio")(req, res, (err) => (err ? reject(err) : resolve()));
    });

    const file = req.file;
    const body = req.body || {};
    const agentId = body.agentId;
    const context = body.context || "";
    const systemPromptFromFront = body.systemPrompt || "";
    const sessionId = body.sessionId || "";

    if (!file) {
      return res
        .status(400)
        .json({ ok: false, error: "No se recibió archivo de audio" });
    }

    if (!agentId) {
      return res.status(400).json({ ok: false, error: "Falta agentId" });
    }

    const agent = AGENTS_BASE.find((a) => a.id === agentId);
    if (!agent) {
      return res.status(400).json({ ok: false, error: "Agente inválido" });
    }

    if (!process.env.OPENAI_API_KEY) {
      return res.status(500).json({
        ok: false,
        error: "OPENAI_API_KEY no configurada",
      });
    }

    if (!process.env.FRONTEND_URL) {
      return res.status(500).json({
        ok: false,
        error: "FRONTEND_URL no configurada (URL del Next frontend)",
      });
    }

    // 2) Transcribir audio con Whisper
    console.log("[voice-chat] Transcribiendo audio...", {
      agentId,
      sessionId,
      size: file.size,
      mimetype: file.mimetype,
    });

    const transcription = await openai.audio.transcriptions.create({
      file: {
        data: file.buffer, // ✅ este era el bug en tu código viejo
        name: file.originalname || "audio.webm",
      },
      model: "whisper-1",
      language: "es",
    });

    const question = (transcription.text || "").trim();
    console.log("[voice-chat] ✅ Transcripción:", question);

    if (!question) {
      return res.status(200).json({
        ok: true,
        question: "",
        answer: "",
        audioBase64: "",
        mimeType: "audio/mpeg",
      });
    }

    // 3) Preparar payload EXACTO para /api/chat (usa el prompt que le mandás desde el front si existe)
    const payload = {
      systemPrompt: systemPromptFromFront || agent.systemPrompt || "",
      context,
      adminMode: false,
      messages: [{ role: "user", content: question }],
    };

    // 4) Llamar a /api/chat del frontend (mismo flujo que texto)
    const chatUrl = `${process.env.FRONTEND_URL.replace(/\/$/, "")}/api/chat`;
    console.log("[voice-chat] Llamando a", chatUrl);

    const r = await fetch(chatUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "text/event-stream",
      },
      body: JSON.stringify(payload),
    });

    if (!r.ok) {
      const txt = await r.text().catch(() => "");
      console.error("[voice-chat] Error en /api/chat:", r.status, txt);
      return res
        .status(500)
        .json({ ok: false, error: "Error en /api/chat", detail: txt });
    }

    // 5) /api/chat devuelve SSE → convertir a texto final
    let answerRaw = await readSSEStreamToText(r.body);
    answerRaw = (answerRaw || "").trim();

    // Limpieza para mostrar y para TTS
    const answer = cleanForTTS(answerRaw) || "No encontré información suficiente en la documentación disponible.";

    console.log("[voice-chat] ✅ Respuesta final (texto):", answer.slice(0, 200));

    // 6) TTS (audio)
    console.log("[voice-chat] Generando TTS...");

    const speech = await openai.audio.speech.create({
      model: "gpt-4o-mini-tts",
      voice: "alloy", // podés cambiar: alloy, aria, verse, etc (según disponibilidad)
      input: answer,
      // format: "mp3", // si tu SDK lo soporta explícito, opcional
    });

    const audioBuf = Buffer.from(await speech.arrayBuffer());
    const audioBase64 = audioBuf.toString("base64");

    console.log("[voice-chat] ✅ Audio generado:", audioBuf.length, "bytes");

    return res.status(200).json({
      ok: true,
      agentId,
      sessionId,
      question,
      answer,
      audioBase64,
      mimeType: "audio/mpeg",
    });
  } catch (e) {
    console.error("❌ Error en voice-chat:", e);
    return res.status(500).json({
      ok: false,
      error: "Error interno en voice-chat",
      detail: e?.message || String(e),
    });
  }
}
