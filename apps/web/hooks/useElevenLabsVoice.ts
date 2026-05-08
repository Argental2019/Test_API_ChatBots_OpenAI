// apps/web/hooks/useElevenLabsVoice.ts
"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export type VoiceState = "idle" | "listening" | "speaking" | "interrupted";

export type VoiceMessage = {
  role: "user" | "assistant";
  content: string;
  ts: number;
};

type UseElevenLabsVoiceOptions = {
  systemPrompt: string;
  onNewMessage?: (msg: VoiceMessage) => void;
};

export function useElevenLabsVoice({ systemPrompt, onNewMessage }: UseElevenLabsVoiceOptions) {
  const [state, setState] = useState<VoiceState>("idle");
  const [messages, setMessages] = useState<VoiceMessage[]>([]);
  const [error, setError] = useState<string | null>(null);

  const systemPromptRef = useRef(systemPrompt);
  useEffect(() => { systemPromptRef.current = systemPrompt; }, [systemPrompt]);

  const wsRef = useRef<WebSocket | null>(null);
  const activeRef = useRef(false);
  const stateRef = useRef<VoiceState>("idle");

  // Audio input
  const streamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const workletNodeRef = useRef<AudioWorkletNode | null>(null);

  // Audio output
  const outputContextRef = useRef<AudioContext | null>(null);
  const audioQueueRef = useRef<Float32Array[]>([]);
  const isPlayingRef = useRef(false);
  const nextPlayTimeRef = useRef(0);

  const updateState = useCallback((s: VoiceState) => {
    stateRef.current = s;
    setState(s);
  }, []);

  // ── Reproducir PCM16 de ElevenLabs ──
  const playPCM16 = useCallback((base64: string) => {
    if (!outputContextRef.current) return;
    const ctx = outputContextRef.current;

    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);

    const samples = new Int16Array(bytes.buffer);
    const float32 = new Float32Array(samples.length);
    for (let i = 0; i < samples.length; i++) float32[i] = samples[i] / 32768.0;

    const buffer = ctx.createBuffer(1, float32.length, 16000);
    buffer.copyToChannel(float32, 0);

    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.connect(ctx.destination);

    const now = ctx.currentTime;
    const startTime = Math.max(now, nextPlayTimeRef.current);
    source.start(startTime);
    nextPlayTimeRef.current = startTime + buffer.duration;

    source.onended = () => {
      if (stateRef.current === "speaking" && nextPlayTimeRef.current <= ctx.currentTime + 0.1) {
        updateState("listening");
      }
    };
  }, [updateState]);

  // ── Manejar mensajes WebSocket ──
  // Convierte números en palabras a dígitos (español argentino)
  const wordsToNumber = (words: string): number | null => {
    const ones: Record<string, number> = {
      "cero":0,"un":1,"uno":1,"una":1,"dos":2,"tres":3,"cuatro":4,"cinco":5,
      "seis":6,"siete":7,"ocho":8,"nueve":9,"diez":10,"once":11,"doce":12,
      "trece":13,"catorce":14,"quince":15,"dieciséis":16,"dieciseis":16,
      "diecisiete":17,"dieciocho":18,"diecinueve":19,"veinte":20,"veintiún":21,
      "veintiuno":21,"veintidós":22,"veintidos":22,"veintitrés":23,"veintitres":23,
      "veinticuatro":24,"veinticinco":25,"veintiséis":26,"veintiseis":26,
      "veintisiete":27,"veintiocho":28,"veintinueve":29,
    };
    const tens: Record<string, number> = {
      "treinta":30,"cuarenta":40,"cincuenta":50,"sesenta":60,"setenta":70,
      "ochenta":80,"noventa":90,
    };
    const hundreds: Record<string, number> = {
      "cien":100,"ciento":100,"doscientos":200,"doscientas":200,"trescientos":300,
      "trescientas":300,"cuatrocientos":400,"cuatrocientas":400,"quinientos":500,
      "quinientas":500,"seiscientos":600,"seiscientas":600,"setecientos":700,
      "setecientas":700,"ochocientos":800,"ochocientas":800,"novecientos":900,
      "novecientas":900,
    };
    const w = words.toLowerCase().trim();
    // Millones
    const millMatch = w.match(/^(.*?)\s*(millones?|millón)\s*(.*)$/);
    if (millMatch) {
      const left = millMatch[1] ? wordsToNumber(millMatch[1]) ?? 1 : 1;
      const right = millMatch[3] ? wordsToNumber(millMatch[3]) ?? 0 : 0;
      return left * 1000000 + right;
    }
    // Miles
    const milMatch = w.match(/^(.*?)\s*mil\s*(.*)$/);
    if (milMatch) {
      const left = milMatch[1] ? wordsToNumber(milMatch[1]) ?? 1 : 1;
      const right = milMatch[2] ? wordsToNumber(milMatch[2]) ?? 0 : 0;
      return left * 1000 + right;
    }
    // Hundreds + tens + ones
    let total = 0;
    const parts = w.split(/\s+y\s+|\s+/);
    for (const p of parts) {
      if (hundreds[p] !== undefined) total += hundreds[p];
      else if (tens[p] !== undefined) total += tens[p];
      else if (ones[p] !== undefined) total += ones[p];
      else if (/^\d+$/.test(p)) total += parseInt(p);
      else if (p && p !== "y") return null;
    }
    return total;
  };

  // Reemplaza "X unidad" escrito en palabras a formato numérico
  const fixMeasures = (text: string): string => {
    const unitMap: Record<string, string> = {
      "milímetros": "mm", "milímetro": "mm",
      "centímetros": "cm", "centímetro": "cm",
      "metros cuadrados": "m²", "metro cuadrado": "m²",
      "metros cúbicos": "m³", "metro cúbico": "m³",
      "metros": "m", "metro": "m",
      "kilogramos": "kg", "kilogramo": "kg", "kilos": "kg", "kilo": "kg",
      "kilowatts": "kW", "kilowatt": "kW",
      "kilocalorías por hora": "Kcal/h",
      "grados centígrados": "°C", "grados": "°C",
      "amperes": "A", "ampere": "A",
      "hertz": "Hz",
      "volts": "V", "volt": "V",
      "bar": "bar",
      "kilopascales": "KPa", "kilopascal": "KPa",
    };

    // Palabras de números en español para el regex
    const numWords = [
      "cero","un","uno","una","dos","tres","cuatro","cinco","seis","siete","ocho","nueve",
      "diez","once","doce","trece","catorce","quince","dieciséis","dieciseis","diecisiete",
      "dieciocho","diecinueve","veinte","veintiún","veintiuno","veintidós","veintidos",
      "veintitrés","veintitres","veinticuatro","veinticinco","veintiséis","veintiseis",
      "veintisiete","veintiocho","veintinueve","treinta","cuarenta","cincuenta","sesenta",
      "setenta","ochenta","noventa","cien","ciento","doscientos","doscientas","trescientos",
      "trescientas","cuatrocientos","cuatrocientas","quinientos","quinientas","seiscientos",
      "seiscientas","setecientos","setecientas","ochocientos","ochocientas","novecientos",
      "novecientas","mil","miles","millón","millones","y",
    ].join("|");

    const unitNames = Object.keys(unitMap).sort((a,b) => b.length - a.length).join("|");
const pattern = new RegExp(`\\b((?:(?:${numWords})\\s*)+(?:punto\\s*(?:${numWords})\\s*)?)\\s*(${unitNames})\\b`, "gi");
    return text.replace(pattern, (match, numPart, unitPart) => {
      const unitKey = unitPart.toLowerCase().trim();
      const unit = unitMap[unitKey];
      if (!unit) return match;

      // Manejar decimales: "cuatro punto setenta y dos"
      const decMatch = numPart.match(/^(.+?)\s+punto\s+(.+)$/i);
      if (decMatch) {
        const intPart = wordsToNumber(decMatch[1].trim());
        const decPart = wordsToNumber(decMatch[2].trim());
        if (intPart !== null && decPart !== null) {
          return `${intPart}.${decPart} ${unit}`;
        }
      }

      const num = wordsToNumber(numPart.trim());
      if (num !== null) return `${num} ${unit}`;
      return match;
    });
  };

  // Post-procesa el texto transcripto para restaurar formato escrito correcto
  const fixTranscriptText = useCallback((text: string): string => {
    let t = fixMeasures(text);
    // Teléfono Argental — múltiples formas orales posibles
    t = t.replace(/m[aá]s\s+cincuenta\s+y\s+cuatro\s+nueve\s+treinta\s+y\s+cuatro\s+uno\s+cinco\s+cuatro\s+siete\s+cero\s+siete\s+tres\s+siete/gi, "+5493415470737");
    t = t.replace(/m[aá]s\s+cinco\s+cuatro\s+nueve\s+tres?\s+cuatro\s+uno\s+cinco\s+cuatro\s+siete\s+cero\s+siete\s+tres\s+siete/gi, "+5493415470737");
    t = t.replace(/m[aá]s\s+cinco\s+cuatro\s+nueve\s+tres\s+cuatro\s+uno\s+cinco\s+cuatro\s+siete\s+cero\s+siete\s+tres\s+siete/gi, "+5493415470737");
    t = t.replace(/\+?54\s*9\s*341\s*5\s*47\s*0\s*7\s*3\s*7/g, "+5493415470737");
    // Modelos técnicos pronunciados
    t = t.replace(/Efe\s+E\s+novecientos\s+sesenta/gi, "FE 4.0-960");
    t = t.replace(/Efe\s+E\s+cuatro\s+punto\s+cero\s+novecientos\s+sesenta\s+Bio/gi, "FE 4.0-960 BIO");
    t = t.replace(/Efe\s+E\s+cuatro\s+punto\s+cero\s+novecientos\s+sesenta/gi, "FE 4.0-960");
    t = t.replace(/Efe\s+E\s+cuatro\s+punto\s+cero\s+cuatrocientos\s+setenta\s+y\s+dos\s+Bio/gi, "FE 4.0-472 BIO");
    t = t.replace(/Efe\s+E\s+cuatro\s+punto\s+cero\s+cuatrocientos\s+setenta\s+y\s+dos/gi, "FE 4.0-472");
    t = t.replace(/Efe\s+E\s+tres\s+quince/gi, "FE III-315");
    t = t.replace(/Eme\s+Be\s+E\s+ochenta\s+U\s+ese/gi, "MBE-80U-S");
    t = t.replace(/Eme\s+Be\s+E\s+ochenta\s+ese/gi, "MBE-80S");
    t = t.replace(/Eme\s+Be\s+E\s+doscientos\s+U\s+ese/gi, "MBE-200U-S");
    t = t.replace(/Eme\s+Be\s+E\s+ciento\s+sesenta\s+H\s+A/gi, "MBE-160HA");
    t = t.replace(/Eme\s+Be\s+E\s+cuarenta\s+T/gi, "MBE-40T");
    t = t.replace(/Panier\s+tres\s+cuarenta/gi, "PA340");
    t = t.replace(/Panier\s+tres\s+noventa/gi, "PA390");
    t = t.replace(/trescientos\s+sesenta\s+B\s+E/gi, "360 BE");
    t = t.replace(/G\s+T\s+treinta\s+y\s+ocho/gi, "GT-38");
    t = t.replace(/G\s+T\s+mini/gi, "GT-Mini");
    t = t.replace(/G\s+T\s+Panier/gi, "GT-Panier");
    t = t.replace(/G\s+T\s+C\s+modular/gi, "GTC-I Mod.");
    t = t.replace(/S\s+G\s+A\s+U\s+modular/gi, "SGAUI");
    t = t.replace(/D\s+B\s+mil\s+doscientos/gi, "DB-1200");
    t = t.replace(/D\s+B\s+mil/gi, "DB-1000");
    t = t.replace(/D\s+B\s+S\s+A/gi, "DBSA");
    t = t.replace(/D\s+B\s+S/gi, "DBS");
    t = t.replace(/C\s+F\s+A/gi, "CFA");
    t = t.replace(/H\s+C\s+I\s+quinientos/gi, "HCI-500");
    t = t.replace(/H\s+dos\s+C/gi, "H2C");
    t = t.replace(/T\s+S\s+I/gi, "TSI");
    t = t.replace(/L\s+P\s+N\s+seiscientos/gi, "LPN-600");
    t = t.replace(/L\s+P\s+N\s+quinientos\s+veinte\s+S/gi, "LPN-520S");
    t = t.replace(/R\s+A\s+doce\s+Pack/gi, "RA12-Pack");
    t = t.replace(/C\s+cuatro\s+mil/gi, "C-4000");
    t = t.replace(/C\s+doce\s+mil/gi, "C-12000");
    return t;
  }, []);

  const handleMessage = useCallback((event: MessageEvent) => {
    try {
      const msg = JSON.parse(event.data);
      const type: string = msg.type;

      // Log ALL events to diagnose
      console.log("[ElevenLabs] evento recibido:", type, JSON.stringify(msg).slice(0, 200));

      if (type === "conversation_initiation_metadata") {
        console.log("[ElevenLabs] Sesión iniciada:", msg.conversation_initiation_metadata_event?.conversation_id);
        updateState("listening");
        return;
      }

      if (type === "user_transcript") {
        // ✅ Campo correcto: user_transcription_event.user_transcript
        const userText = fixTranscriptText((msg.user_transcription_event?.user_transcript || "").trim());
        const isNoise = !userText || userText.length < 3 || !/[a-záéíóúüñA-ZÁÉÍÓÚÜÑ]/.test(userText);
        if (!isNoise) {
          const message: VoiceMessage = { role: "user", content: userText, ts: Date.now() };
          setMessages(prev => [...prev, message]);
          onNewMessage?.(message);
        }
        return;
      }

      if (type === "agent_response") {
        // ✅ Campo correcto: agent_response_event.agent_response
        const text = fixTranscriptText((msg.agent_response_event?.agent_response || "").trim());
        if (text) {
          const message: VoiceMessage = { role: "assistant", content: text, ts: Date.now() };
          setMessages(prev => [...prev, message]);
          onNewMessage?.(message);
        }
        return;
      }

      if (type === "audio") {
        updateState("speaking");
        const audioB64 = msg.audio_event?.audio_base_64;
        if (audioB64) playPCM16(audioB64);
        return;
      }

      if (type === "interruption") {
        // ✅ Cortar audio inmediatamente — recrear AudioContext de salida
        if (outputContextRef.current) {
          outputContextRef.current.close().catch(() => {});
          const newCtx = new AudioContext({ sampleRate: 16000 });
          outputContextRef.current = newCtx;
          nextPlayTimeRef.current = 0;
        }
        updateState("interrupted");
        setTimeout(() => updateState("listening"), 200);
        return;
      }

      if (type === "ping") {
        wsRef.current?.send(JSON.stringify({
          type: "pong",
          event_id: msg.ping_event?.event_id
        }));
        return;
      }

    } catch (e) {
      console.warn("[ElevenLabs] Error parseando mensaje:", e);
    }
  }, [onNewMessage, playPCM16, updateState]);

  // ── Iniciar modo voz ──
  const startVoiceMode = useCallback(async () => {
    try {
      setError(null);
      setMessages([]);
      activeRef.current = true;

      // 1. Token
      const tokenRes = await fetch("/api/elevenlabs-session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ systemPrompt: systemPromptRef.current }),
      });
      if (!tokenRes.ok) throw new Error("No se pudo crear sesión ElevenLabs");
      const { signed_url, system_prompt } = await tokenRes.json();
      if (!signed_url) throw new Error("URL firmada inválida");

      // 2. AudioContext para OUTPUT (reproducción)
      const outCtx = new AudioContext({ sampleRate: 16000 });
      outputContextRef.current = outCtx;
      nextPlayTimeRef.current = 0;

      // 3. Micrófono
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { sampleRate: 16000, channelCount: 1, echoCancellation: true, noiseSuppression: true }
      });
      streamRef.current = stream;

      // 4. AudioContext para INPUT (micrófono)
      const inCtx = new AudioContext({ sampleRate: 16000 });
      audioContextRef.current = inCtx;
      const source = inCtx.createMediaStreamSource(stream);

      // 5. WebSocket
      const ws = new WebSocket(signed_url);
      wsRef.current = ws;
      ws.binaryType = "arraybuffer";

      ws.onopen = () => {
        console.log("[ElevenLabs] WebSocket conectado ✅");

        // Inyectar system prompt
        ws.send(JSON.stringify({
          type: "conversation_initiation_client_data",
          conversation_config_override: {
            agent: {
              prompt: { prompt: system_prompt },
              language: "es",
            },
          },
        }));

        // 6. ScriptProcessor para enviar audio PCM16
        const processor = inCtx.createScriptProcessor(4096, 1, 1);
        processor.onaudioprocess = (e) => {
          if (ws.readyState !== WebSocket.OPEN) return;

          const float32 = e.inputBuffer.getChannelData(0);
          const int16 = new Int16Array(float32.length);
          for (let i = 0; i < float32.length; i++) {
            int16[i] = Math.max(-32768, Math.min(32767, float32[i] * 32768));
          }

          const bytes = new Uint8Array(int16.buffer);
          let binary = "";
          for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);

          ws.send(JSON.stringify({
            user_audio_chunk: btoa(binary)
          }));
        };

        source.connect(processor);
        processor.connect(inCtx.destination);
        workletNodeRef.current = processor as any;
      };

      ws.onmessage = handleMessage;
      ws.onerror = (e) => { console.error("[ElevenLabs] WS error:", e); setError("Error de conexión"); };
      ws.onclose = (e) => {
        console.log("[ElevenLabs] WS cerrado, code:", e.code, "reason:", e.reason);
        if (activeRef.current) updateState("idle");
      };

    } catch (e: any) {
      console.error("[ElevenLabs] Error:", e);
      setError(e?.message || "Error iniciando modo voz");
      activeRef.current = false;
      updateState("idle");
    }
  }, [handleMessage, updateState]);

  // ── Detener modo voz ──
  const stopVoiceMode = useCallback(() => {
    activeRef.current = false;

    streamRef.current?.getTracks().forEach(t => t.stop());
    streamRef.current = null;

    audioContextRef.current?.close().catch(() => {});
    audioContextRef.current = null;

    outputContextRef.current?.close().catch(() => {});
    outputContextRef.current = null;

    workletNodeRef.current = null;
    audioQueueRef.current = [];
    isPlayingRef.current = false;
    nextPlayTimeRef.current = 0;

    wsRef.current?.close();
    wsRef.current = null;

    updateState("idle");
  }, [updateState]);

  useEffect(() => { return () => { stopVoiceMode(); }; }, [stopVoiceMode]);

  return { state, messages, error, startVoiceMode, stopVoiceMode };
}