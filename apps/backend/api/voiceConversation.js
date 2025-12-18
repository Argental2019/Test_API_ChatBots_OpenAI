// apps/backend/api/voiceConversation.js
import dotenv from "dotenv";
dotenv.config();

import express from "express";
import multer from "multer";
import OpenAI from "openai";
import axios from "axios";

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage() });

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const AGENTS_BACKEND_URL =
  process.env.AGENTS_BACKEND_URL || "https://test-chatbots-back.vercel.app";

router.post(
  "/voice-chat",
  upload.single("audio"),
  async (req, res) => {
    try {
      const { agentId, systemPrompt, context, sessionId } = req.body;

      if (!req.file) {
        return res.status(400).json({ ok: false, error: "Falta archivo de audio" });
      }
      if (!agentId) {
        return res.status(400).json({ ok: false, error: "Falta agentId" });
      }

      const audioBuffer = req.file.buffer;

      console.log("[voice-chat] Transcribiendo audio...");

      // ✅ CORRECCIÓN: Usar File API correctamente
      const transcription = await openai.audio.transcriptions.create({
        file: new File([audioBuffer], "audio.webm", { type: "audio/webm" }),
        model: "whisper-1",
        language: "es",
      });

      const userText = transcription.text?.trim();
      
      console.log("[voice-chat] ✅ Transcripción:", userText);

      if (!userText) {
        return res.status(400).json({
          ok: false,
          error: "No se pudo transcribir el audio",
        });
      }

      const messages = [{ role: "user", content: userText }];

      console.log("[voice-chat] Enviando a /api/chat");

      // Llamar al endpoint de chat del frontend
      const chatUrl = `${process.env.FRONTEND_URL || "http://localhost:3000"}/api/chat`;
      
      const chatResponse = await axios.post(
        chatUrl,
        {
          messages,
          systemPrompt: systemPrompt || "",
          context: context || "",
          adminMode: false,
        },
        {
          headers: { 
            "Content-Type": "application/json",
            "Accept": "text/event-stream"
          },
          responseType: 'stream'
        }
      );

      // Procesar el stream SSE
      let answerText = "";
      
      for await (const chunk of chatResponse.data) {
        const textChunk = chunk.toString();
        const lines = textChunk.split("\n");
        
        for (const line of lines) {
          if (!line.trim().startsWith("data:")) continue;
          
          const data = line.slice(5).trim();
          if (!data || data === "[DONE]") continue;
          
          try {
            const parsed = JSON.parse(data);
            const delta = parsed.choices?.[0]?.delta?.content || "";
            if (delta) answerText += delta;
          } catch (e) {
            // Ignorar líneas no válidas
          }
        }
      }

      console.log("[voice-chat] ✅ Respuesta:", answerText.substring(0, 100));

      if (!answerText || !answerText.trim()) {
        answerText = "No encontré información suficiente en la documentación disponible.";
      }

      // Limpiar metadatos técnicos
      answerText = answerText.replace(/@@META\s*\{[\s\S]*?\}/g, "").trim();
      answerText = answerText.replace(/^@@MISS\s*\{[^\n]*\}\s*\n?/m, "").trim();

      console.log("[voice-chat] Generando TTS...");

      // Convertir a voz
      const speech = await openai.audio.speech.create({
        model: "tts-1",
        voice: "onyx", // Opciones: alloy, echo, fable, onyx, nova, shimmer
        input: answerText,
        speed: 1.15,
      });

      const audioBufferOut = Buffer.from(await speech.arrayBuffer());
      const audioBase64 = audioBufferOut.toString("base64");

      console.log("[voice-chat] ✅ Audio generado");

      return res.json({
        ok: true,
        agentId,
        question: userText,
        answer: answerText,
        audioBase64,
        mimeType: "audio/mpeg",
      });
    } catch (err) {
      console.error("❌ Error en /api/voice-chat:", err?.response?.data || err);
      return res.status(500).json({
        ok: false,
        error: "Error interno en modo conversación",
        details: err.message || err.toString(),
      });
    }
  }
);

export default router;