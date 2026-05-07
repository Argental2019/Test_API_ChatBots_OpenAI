// apps/web/hooks/useRealtimeVoice.ts
"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export type VoiceState =
  | "idle"
  | "listening"
  | "speaking"
  | "interrupted";

export type VoiceMessage = {
  role: "user" | "assistant";
  content: string;
  ts: number;
};

type UseRealtimeVoiceOptions = {
  systemPrompt: string;
  onNewMessage?: (msg: VoiceMessage) => void;
};

export function useRealtimeVoice({ systemPrompt, onNewMessage }: UseRealtimeVoiceOptions) {
  const [state, setState] = useState<VoiceState>("idle");
  const [messages, setMessages] = useState<VoiceMessage[]>([]);
  const [error, setError] = useState<string | null>(null);

  const systemPromptRef = useRef(systemPrompt);
  useEffect(() => { systemPromptRef.current = systemPrompt; }, [systemPrompt]);

  const pcRef = useRef<RTCPeerConnection | null>(null);
  const dcRef = useRef<RTCDataChannel | null>(null);
  const audioElRef = useRef<HTMLAudioElement | null>(null);
  const activeRef = useRef(false);
  const stateRef = useRef<VoiceState>("idle");

  const currentTranscriptRef = useRef("");
  const currentAssistantRef = useRef("");

  const updateState = useCallback((s: VoiceState) => {
    stateRef.current = s;
    setState(s);
  }, []);

  const handleRealtimeEvent = useCallback((event: any) => {
    const type: string = event.type;
    console.log("[Realtime] evento:", type);

    if (type === "input_audio_buffer.speech_started") {
      currentTranscriptRef.current = "";
      if (stateRef.current === "speaking") {
        updateState("interrupted");
        setTimeout(() => updateState("listening"), 300);
      } else {
        updateState("listening");
      }
      return;
    }

    if (type === "input_audio_buffer.speech_stopped") return;

    if (type === "conversation.item.input_audio_transcription.delta") {
      currentTranscriptRef.current += event.delta || "";
      return;
    }

    if (type === "conversation.item.input_audio_transcription.completed") {
      const userText = (event.transcript || currentTranscriptRef.current).trim();
      console.log("[Realtime] Transcripción usuario:", userText);
      const isNoise = !userText || userText.length < 3 || !/[a-záéíóúüñA-ZÁÉÍÓÚÜÑ]/.test(userText);
      if (userText && !isNoise) {
        const msg: VoiceMessage = { role: "user", content: userText, ts: Date.now() };
        setMessages((prev) => [...prev, msg]);
        onNewMessage?.(msg);
      }
      currentTranscriptRef.current = "";
      return;
    }

    if (type === "response.created") {
      currentAssistantRef.current = "";
      updateState("speaking");
      return;
    }

    if (type === "response.audio_transcript.delta") {
      currentAssistantRef.current += event.delta || "";
      return;
    }

    if (type === "response.audio_transcript.done") {
      const assistantText = (event.transcript || currentAssistantRef.current).trim();
      console.log("[Realtime] Respuesta agente (audio):", assistantText.slice(0, 100));
      if (assistantText) {
        const msg: VoiceMessage = { role: "assistant", content: assistantText, ts: Date.now() };
        setMessages((prev) => [...prev, msg]);
        onNewMessage?.(msg);
      }
      currentAssistantRef.current = "";
      return;
    }

    if (type === "response.text.delta") {
      currentAssistantRef.current += event.delta || "";
      return;
    }

    if (type === "response.text.done") {
      const assistantText = (event.text || currentAssistantRef.current).trim();
      console.log("[Realtime] Respuesta agente (texto fallback):", assistantText.slice(0, 100));
      if (assistantText) {
        const msg: VoiceMessage = { role: "assistant", content: assistantText, ts: Date.now() };
        setMessages((prev) => [...prev, msg]);
        onNewMessage?.(msg);
      }
      currentAssistantRef.current = "";
      updateState("listening");
      return;
    }

    if (type === "output_audio_buffer.stopped") {
      updateState("listening");
      return;
    }

    if (type === "response.done") {
  // output_audio_buffer.stopped maneja el cambio a listening
  // Fallback largo por si no llega
  setTimeout(() => {
    if (stateRef.current === "speaking") updateState("listening");
  }, 3000);
  return;
}

    if (type === "session.created" || type === "session.updated") {
      console.log("[Realtime] Sesión lista:", type);
      updateState("listening");
      return;
    }

    if (type === "error") {
      console.error("[Realtime] Error del servidor:", event.error);
      setError(event.error?.message || "Error en la conversación");
      updateState("idle");
      return;
    }

  }, [onNewMessage, updateState]);

  const startVoiceMode = useCallback(async () => {
    try {
      setError(null);
      setMessages([]);
      activeRef.current = true;

      const tokenRes = await fetch("/api/realtime", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ systemPrompt: systemPromptRef.current }),
      });

      if (!tokenRes.ok) throw new Error("No se pudo crear sesión Realtime");
      const { client_secret } = await tokenRes.json();
      if (!client_secret?.value) throw new Error("Token inválido");

      const pc = new RTCPeerConnection();
      pcRef.current = pc;

      const audioEl = document.createElement("audio");
      audioEl.autoplay = true;
      document.body.appendChild(audioEl);
      audioElRef.current = audioEl;

      pc.ontrack = (e) => {
        console.log("[Realtime] Track recibido:", e.track.kind);
        if (e.track.kind === "audio") {
          audioEl.srcObject = e.streams[0];
        }
      };

      // Micrófono del usuario
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach((track) => pc.addTrack(track, stream));

      // Transceiver para recibir audio del modelo
      pc.addTransceiver("audio", { direction: "recvonly" });

      const dc = pc.createDataChannel("oai-events");
      dcRef.current = dc;

      dc.onopen = () => {
        console.log("[Realtime] Data channel abierto ✅");
        updateState("listening");
      };

      dc.onmessage = (e) => {
        try {
          const event = JSON.parse(e.data);
          handleRealtimeEvent(event);
        } catch (err) {
          console.warn("[Realtime] Error parseando evento:", err);
        }
      };

      dc.onerror = (e) => console.error("[Realtime] Data channel error:", e);
      dc.onclose = () => console.log("[Realtime] Data channel cerrado");

      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);

      const sdpRes = await fetch(
        "https://api.openai.com/v1/realtime?model=gpt-4o-realtime-preview-2024-12-17",
        {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${client_secret.value}`,
            "Content-Type": "application/sdp",
          },
          body: offer.sdp,
        }
      );

      if (!sdpRes.ok) {
        const err = await sdpRes.text();
        throw new Error(`Error handshake WebRTC: ${err}`);
      }

      const answerSdp = await sdpRes.text();
      await pc.setRemoteDescription({ type: "answer", sdp: answerSdp });

      console.log("[Realtime] WebRTC conectado ✅");

    } catch (e: any) {
      console.error("[Realtime] Error:", e);
      setError(e?.message || "Error iniciando modo voz");
      activeRef.current = false;
      updateState("idle");
    }
  }, [handleRealtimeEvent, updateState]);

  const stopVoiceMode = useCallback(() => {
    activeRef.current = false;
    dcRef.current?.close();
    dcRef.current = null;
    pcRef.current?.getSenders().forEach(s => s.track?.stop());
    pcRef.current?.close();
    pcRef.current = null;
    if (audioElRef.current) {
      audioElRef.current.srcObject = null;
      audioElRef.current.remove();
      audioElRef.current = null;
    }
    updateState("idle");
  }, [updateState]);

  useEffect(() => {
    return () => { stopVoiceMode(); };
  }, [stopVoiceMode]);

  return { state, messages, error, startVoiceMode, stopVoiceMode };
}