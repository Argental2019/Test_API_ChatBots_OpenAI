// apps/web/hooks/useVoiceConversation.ts
"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export type VoiceState =
  | "idle"
  | "listening"
  | "processing"
  | "speaking"
  | "interrupted";

export type VoiceMessage = {
  role: "user" | "assistant";
  content: string;
  ts: number;
};

type UseVoiceConversationOptions = {
  agentId: string;
  context: string;
  systemPrompt: string;
  backendBase: string;
  onNewMessage?: (msg: VoiceMessage) => void;
};

const SILENCE_THRESHOLD_MS = 1200;
const VOICE_THRESHOLD = 0.015;
const MIN_VOICE_DURATION_MS = 300;

// Divide texto en frases para TTS por streaming
function splitIntoSentences(text: string): string[] {
  const parts = text.match(/[^.!?;]+[.!?;]*/g) || [];
  const result: string[] = [];
  let current = "";
  for (const part of parts) {
    current += part;
    if (current.trim().length >= 60) {
      result.push(current.trim());
      current = "";
    }
  }
  if (current.trim()) result.push(current.trim());
  return result.filter(Boolean);
}

export function useVoiceConversation({
  agentId,
  context,
  systemPrompt,
  backendBase,
  onNewMessage,
}: UseVoiceConversationOptions) {
  const [state, setState] = useState<VoiceState>("idle");
  const [messages, setMessages] = useState<VoiceMessage[]>([]);
  const [error, setError] = useState<string | null>(null);

  // Siempre el último valor
  const contextRef = useRef(context);
  const systemPromptRef = useRef(systemPrompt);
  useEffect(() => { contextRef.current = context; }, [context]);
  useEffect(() => { systemPromptRef.current = systemPrompt; }, [systemPrompt]);

  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);
  const currentAudioRef = useRef<HTMLAudioElement | null>(null);
  const vadLoopRef = useRef<number | null>(null);
  const ttsAbortRef = useRef<AbortController | null>(null);

  const stateRef = useRef<VoiceState>("idle");
  const activeRef = useRef(false);
  // ── Fix barge-in: silencia el VAD mientras habla el TTS ──
  const isSpeakingRef = useRef(false);

  const silenceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const voiceStartTimeRef = useRef<number | null>(null);
  const isRecordingVoiceRef = useRef(false);

  const updateState = (s: VoiceState) => {
    stateRef.current = s;
    setState(s);
  };

  // ── Interrumpir TTS ──
  const interruptSpeaking = useCallback(() => {
    isSpeakingRef.current = false;
    ttsAbortRef.current?.abort();
    ttsAbortRef.current = null;
    if (currentAudioRef.current) {
      currentAudioRef.current.pause();
      currentAudioRef.current.src = "";
      currentAudioRef.current = null;
    }
  }, []);

  // ── TTS por frases (streaming inmediato) ──
  // Llama a /api/tts frase por frase y reproduce en cadena
  const speakStreaming = useCallback(async (fullText: string): Promise<void> => {
    const sentences = splitIntoSentences(fullText);
    if (!sentences.length) return;

    isSpeakingRef.current = true;
    const abortCtrl = new AbortController();
    ttsAbortRef.current = abortCtrl;

    for (const sentence of sentences) {
      if (!activeRef.current || abortCtrl.signal.aborted || !isSpeakingRef.current) break;

      try {
        const res = await fetch("/api/tts", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text: sentence }),
          signal: abortCtrl.signal,
        });

        if (!res.ok || abortCtrl.signal.aborted) break;

        const blob = await res.blob();
        if (abortCtrl.signal.aborted || !isSpeakingRef.current) break;

        const url = URL.createObjectURL(blob);
        const audio = new Audio(url);
        currentAudioRef.current = audio;

        await new Promise<void>((resolve) => {
          audio.onended = () => { URL.revokeObjectURL(url); currentAudioRef.current = null; resolve(); };
          audio.onerror = () => { URL.revokeObjectURL(url); currentAudioRef.current = null; resolve(); };
          // Si se interrumpe mientras reproduce
          abortCtrl.signal.addEventListener("abort", () => {
            audio.pause();
            URL.revokeObjectURL(url);
            currentAudioRef.current = null;
            resolve();
          });
          audio.play().catch(() => resolve());
        });
      } catch (e: any) {
        if (e?.name !== "AbortError") console.error("[TTS] frase error:", e);
        break;
      }
    }

    isSpeakingRef.current = false;
  }, []);

  // ── Grabación ──
  const startCapture = useCallback(() => {
    if (!streamRef.current || isRecordingVoiceRef.current) return;
    chunksRef.current = [];
    const mr = new MediaRecorder(streamRef.current, {
      mimeType: MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
        ? "audio/webm;codecs=opus"
        : "audio/webm",
    });
    mr.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data); };
    mr.start(100);
    mediaRecorderRef.current = mr;
    isRecordingVoiceRef.current = true;
  }, []);

  const stopCaptureAndProcess = useCallback((): Promise<void> => {
    return new Promise((resolve) => {
      const mr = mediaRecorderRef.current;
      if (!mr || !isRecordingVoiceRef.current) { resolve(); return; }
      isRecordingVoiceRef.current = false;
      mr.onstop = async () => {
        const blob = new Blob(chunksRef.current, { type: "audio/webm" });
        chunksRef.current = [];
        mediaRecorderRef.current = null;
        if (!activeRef.current) { resolve(); return; }
        await processAudio(blob);
        resolve();
      };
      mr.stop();
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Procesar audio: STT → LLM → TTS por frases ──
  const processAudio = useCallback(async (blob: Blob) => {
    if (!activeRef.current) return;
    updateState("processing");

    try {
      const formData = new FormData();
      formData.append("audio", blob, "audio.webm");
      formData.append("agentId", agentId);
      formData.append("systemPrompt", systemPromptRef.current);
      formData.append("context", contextRef.current);
      formData.append("sessionId", `voice-${agentId}-${Date.now()}`);

      console.log("[voice] Enviando contexto len:", contextRef.current.length);

      const res = await fetch(
        `${backendBase.replace(/\/$/, "")}/api/voice-chat`,
        { method: "POST", body: formData }
      );

      const data = await res.json();

      if (!data.ok || !data.answer) {
        console.warn("[voice] Sin respuesta del agente");
        if (activeRef.current) { updateState("listening"); resumeVAD(); }
        return;
      }

      const question = (data.question || "").trim();
      const answer = (data.answer || "").trim();

      const now = Date.now();
      setMessages((prev) => [
        ...prev,
        { role: "user", content: question, ts: now },
        { role: "assistant", content: answer, ts: now + 1 },
      ]);
      onNewMessage?.({ role: "user", content: question, ts: now });
      onNewMessage?.({ role: "assistant", content: answer, ts: now + 1 });

      if (!activeRef.current) return;

      // ── Hablar por frases — empieza inmediatamente con la primera ──
      updateState("speaking");
      await speakStreaming(answer);

      if (activeRef.current && stateRef.current !== "interrupted") {
        updateState("listening");
        resumeVAD();
      }
    } catch (e: any) {
      console.error("[voice] processAudio error:", e);
      setError("Error procesando audio. Intentá de nuevo.");
      if (activeRef.current) { updateState("listening"); resumeVAD(); }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [agentId, backendBase, speakStreaming, onNewMessage]);

  // ── VAD loop — ignora audio mientras isSpeakingRef es true ──
  const runVAD = useCallback(() => {
    const analyser = analyserRef.current;
    if (!analyser || !activeRef.current) return;

    const bufferLength = analyser.fftSize;
    const dataArray = new Float32Array(bufferLength);

    const tick = () => {
      if (!activeRef.current) return;

      analyser.getFloatTimeDomainData(dataArray);
      let sum = 0;
      for (let i = 0; i < bufferLength; i++) sum += dataArray[i] ** 2;
      const rms = Math.sqrt(sum / bufferLength);
      const hasVoice = rms > VOICE_THRESHOLD;
      const currentState = stateRef.current;

      // ── Fix barge-in: si el TTS está sonando, ignorar ruido ambiental bajo ──
      // Solo interrumpir si la voz supera un umbral más alto (el usuario habla fuerte)
      const BARGE_IN_THRESHOLD = 0.04;

      if (hasVoice) {
        if (currentState === "speaking") {
          // Solo barge-in si la voz del usuario es suficientemente fuerte
          if (rms > BARGE_IN_THRESHOLD) {
            console.log("[voice] Barge-in detectado, rms:", rms.toFixed(4));
            updateState("interrupted");
            interruptSpeaking();
            setTimeout(() => {
              if (!activeRef.current) return;
              updateState("listening");
              voiceStartTimeRef.current = Date.now();
              startCapture();
            }, 150);
          }
          vadLoopRef.current = requestAnimationFrame(tick);
          return;
        }

        if (currentState === "listening" && !isRecordingVoiceRef.current) {
          voiceStartTimeRef.current = Date.now();
          startCapture();
        }

        if (silenceTimerRef.current) {
          clearTimeout(silenceTimerRef.current);
          silenceTimerRef.current = null;
        }
      } else {
        if (isRecordingVoiceRef.current && currentState === "listening" && !silenceTimerRef.current) {
          const voiceDuration = voiceStartTimeRef.current ? Date.now() - voiceStartTimeRef.current : 0;
          if (voiceDuration < MIN_VOICE_DURATION_MS) {
            if (mediaRecorderRef.current) {
              mediaRecorderRef.current.ondataavailable = null;
              mediaRecorderRef.current.onstop = null;
              try { mediaRecorderRef.current.stop(); } catch {}
              mediaRecorderRef.current = null;
            }
            isRecordingVoiceRef.current = false;
            chunksRef.current = [];
          } else {
            silenceTimerRef.current = setTimeout(async () => {
              silenceTimerRef.current = null;
              if (!activeRef.current || !isRecordingVoiceRef.current) return;
              await stopCaptureAndProcess();
            }, SILENCE_THRESHOLD_MS);
          }
        }
      }

      vadLoopRef.current = requestAnimationFrame(tick);
    };

    vadLoopRef.current = requestAnimationFrame(tick);
  }, [interruptSpeaking, startCapture, stopCaptureAndProcess]);

  const resumeVAD = useCallback(() => {
    if (vadLoopRef.current) cancelAnimationFrame(vadLoopRef.current);
    runVAD();
  }, [runVAD]);

  // ── Iniciar modo voz ──
  const startVoiceMode = useCallback(async () => {
    try {
      setError(null);
      setMessages([]);

      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, sampleRate: 16000 },
      });

      streamRef.current = stream;
      const audioCtx = new AudioContext();
      audioContextRef.current = audioCtx;
      const source = audioCtx.createMediaStreamSource(stream);
      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 2048;
      analyser.smoothingTimeConstant = 0.3;
      source.connect(analyser);
      analyserRef.current = analyser;

      activeRef.current = true;
      updateState("listening");
      runVAD();
    } catch (e: any) {
      setError(
        e?.name === "NotAllowedError"
          ? "Permiso de micrófono denegado. Habilitalo en el navegador."
          : "No se pudo acceder al micrófono."
      );
    }
  }, [runVAD]);

  // ── Detener modo voz ──
  const stopVoiceMode = useCallback(() => {
    activeRef.current = false;
    if (vadLoopRef.current) { cancelAnimationFrame(vadLoopRef.current); vadLoopRef.current = null; }
    if (silenceTimerRef.current) { clearTimeout(silenceTimerRef.current); silenceTimerRef.current = null; }
    interruptSpeaking();
    if (mediaRecorderRef.current) {
      try { mediaRecorderRef.current.stop(); } catch {}
      mediaRecorderRef.current = null;
    }
    isRecordingVoiceRef.current = false;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    audioContextRef.current?.close().catch(() => {});
    audioContextRef.current = null;
    analyserRef.current = null;
    updateState("idle");
  }, [interruptSpeaking]);

  useEffect(() => { return () => { stopVoiceMode(); }; }, [stopVoiceMode]);

  return { state, messages, error, startVoiceMode, stopVoiceMode };
}