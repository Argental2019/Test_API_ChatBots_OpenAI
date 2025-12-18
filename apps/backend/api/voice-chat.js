import multer from "multer";
import fetch from "node-fetch";
import OpenAI from "openai";
import { toFile } from "openai/uploads";

const upload = multer({ storage: multer.memoryStorage() });
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// lee SSE de /api/chat (data: {...}\n)
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

      if (!line.startsWith("data:")) continue;

      const data = line.slice(5).trim();
      if (!data || data === "[DONE]") continue;

      try {
        const json = JSON.parse(data);
        const delta = json?.choices?.[0]?.delta?.content || "";
        if (delta) full += delta;
      } catch {
        // ignorar líneas inválidas
      }
    }
  }
  return full;
}

// ✅ Express handler estilo router
export default function voiceChatRoute(app) {
  app.post("/api/voice-chat", upload.single("audio"), async (req, res) => {
    try {
      const { agentId, systemPrompt, context, tts } = req.body || {};
      const wantsTts = String(tts || "0") === "1";

      if (!req.file) {
        return res.status(400).json({ ok: false, error: "Falta archivo de audio" });
      }
      if (!agentId) {
        return res.status(400).json({ ok: false, error: "Falta agentId" });
      }
      if (!process.env.FRONTEND_URL) {
        return res.status(500).json({ ok: false, error: "FRONTEND_URL no configurada" });
      }

      // 1) Whisper
      const audioFile = await toFile(req.file.buffer, req.file.originalname || "audio.webm");
      const transcription = await openai.audio.transcriptions.create({
        file: audioFile,
        model: "whisper-1",
       // language: "es",
      });

      const question = (transcription.text || "").trim();

      // si no hay texto, devolver ok pero vacío (el front decide qué hacer)
      if (!question) {
        return res.json({ ok: true, question: "", answer: "", audioBase64: null });
      }

      // 2) /api/chat (stream SSE)
      const chatUrl = `${process.env.FRONTEND_URL.replace(/\/$/, "")}/api/chat`;

      const payload = {
        messages: [{ role: "user", content: question }],
        systemPrompt: systemPrompt || "",
        context: context || "",
        adminMode: false,
      };

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
        return res.status(500).json({ ok: false, error: "Error en /api/chat", detail: txt });
      }

      const answer = await readSSEStreamToText(r.body);

      // 3) TTS (solo si corresponde)
      let audioBase64 = null;
      let mimeType = null;

      if (wantsTts) {
        const speech = await openai.audio.speech.create({
          model: "tts-1",
          voice: "nova",
          input: answer || "No encontré información suficiente en la documentación disponible.",
          speed: 1.0,
        });

        const buf = Buffer.from(await speech.arrayBuffer());
        audioBase64 = buf.toString("base64");
        mimeType = "audio/mpeg";
      }

      return res.json({
        ok: true,
        question,
        answer,
        audioBase64,
        mimeType,
      });
    } catch (err) {
      console.error("❌ /api/voice-chat error:", err);
      return res.status(500).json({ ok: false, error: "Error interno", detail: String(err?.message || err) });
    }
  });
}
