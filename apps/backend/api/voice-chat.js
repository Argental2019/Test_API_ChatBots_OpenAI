// backend/api/voice-chat.js
import { OpenAI } from "openai";
import multer from "multer";
import fetch from "node-fetch";
import { AGENTS_BASE } from "../../apps/web/lib/agents";

// === Configuración de subida de audio ===
const upload = multer({ storage: multer.memoryStorage() });

// Cliente OpenAI
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// Helper para parsear el stream SSE de /api/chat (OpenAI streaming)
async function readSSEStreamToText(stream) {
  if (!stream) return "";

  const decoder = new TextDecoder();
  let full = "";

  for await (const chunk of stream) {
    const textChunk = decoder.decode(chunk, { stream: true });

    // /api/chat devuelve SSE tipo "data: {...}\n\n"
    const lines = textChunk.split("\n");
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed.startsWith("data:")) continue;

      const data = trimmed.slice(5).trim(); // después de "data:"
      if (!data || data === "[DONE]") continue;

      try {
        const json = JSON.parse(data);
        const delta = json.choices?.[0]?.delta?.content || "";
        if (delta) full += delta;
      } catch (err) {
        // si alguna línea no es JSON, la ignoramos
        console.warn("[voice-chat] No se pudo parsear chunk SSE:", data);
      }
    }
  }

  return full;
}

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
    // 1) Procesar multipart (campo "audio")
    await new Promise((resolve, reject) => {
      upload.single("audio")(req, res, (err) =>
        err ? reject(err) : resolve()
      );
    });

    const audioFile = req.file;
    const { agentId, context } = req.body || {};

    if (!audioFile) {
      return res
        .status(400)
        .json({ ok: false, error: "No se recibió archivo de audio" });
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

    /* 2) Transcribir audio con Whisper */
    console.log("[voice-chat] Transcribiendo audio...");

    const transcription = await openai.audio.transcriptions.create({
  file: {
    data: file.buffer,
    name: file.originalname || "audio.webm",
  },
  model: "whisper-1",
  language: "es",
});


    const question = (transcription.text || "").trim();

    console.log("[voice-chat] ✅ Transcripción:", question);

    if (!question) {
      return res.status(500).json({
        ok: false,
        error: "No se pudo obtener texto de la transcripción.",
      });
    }

    /* 3) Preparar payload EXACTO que usa /api/chat */
    const payload = {
      systemPrompt: agent.systemPrompt,
      context: context || "", // snapshot de smartRead que ya mandás desde el front
      messages: [
        {
          role: "user",
          content: question,
        },
      ],
    };

    /* 4) Llamar a /api/chat del frontend (mismo flujo que texto) */
    const chatUrl = `${process.env.FRONTEND_URL}/api/chat`;
    console.log("[voice-chat] Llamando a", chatUrl);

    const r = await fetch(chatUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
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

    // 5) /api/chat devuelve un stream SSE → lo convertimos a texto final
    const answer = await readSSEStreamToText(r.body);

    console.log("[voice-chat] ✅ Respuesta final (texto):", answer);

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
