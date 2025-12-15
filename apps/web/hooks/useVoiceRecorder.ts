import { useCallback, useRef, useState } from "react";

type StartOpts = {
  mode: "ptt" | "vad";
};

type Options = {
  mimeTypePreferred?: string;

  // VAD (solo para mode:"vad")
  startThresholdRms?: number;   // umbral para considerar “voz”
  startVoiceMs?: number;        // ms de voz para arrancar grabación
  endThresholdRms?: number;     // umbral para considerar “silencio”
  endSilenceMs?: number;        // ms de silencio para cortar grabación

  minRecordMs?: number;         // mínimo para mandar
  maxRecordMs?: number;         // hard stop SIEMPRE (no se cuelga)
  minSpeechMsToSend?: number;   // si no hubo voz real, NO manda (evita loop)
};

export function useVoiceRecorder(
  onAudioReady: (blob: Blob) => Promise<void>,
  opts: Options = {}
) {
  const {
    mimeTypePreferred = "audio/webm;codecs=opus",

    startThresholdRms = 0.045,
    startVoiceMs = 180,
    endThresholdRms = 0.020,
    endSilenceMs = 900,

    minRecordMs = 450,
    maxRecordMs = 6500,
    minSpeechMsToSend = 220,
  } = opts;

  const [isRecording, setIsRecording] = useState(false);

  const streamRef = useRef<MediaStream | null>(null);
  const mrRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  const audioCtxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const rafRef = useRef<number | null>(null);

  const modeRef = useRef<"ptt" | "vad">("ptt");

  const startedAtRef = useRef(0);
  const speechMsRef = useRef(0);
  const lastTickRef = useRef(0);

  const stopRaf = () => {
    if (rafRef.current != null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
  };

  const cleanup = useCallback(async () => {
    stopRaf();

    if (audioCtxRef.current) {
      try { await audioCtxRef.current.close(); } catch {}
      audioCtxRef.current = null;
    }
    analyserRef.current = null;

    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }

    mrRef.current = null;
    chunksRef.current = [];
    setIsRecording(false);
  }, []);

  const pickMime = useCallback(() => {
    let mt = mimeTypePreferred;
    if (typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported) {
      if (!MediaRecorder.isTypeSupported(mt)) {
        mt = MediaRecorder.isTypeSupported("audio/webm") ? "audio/webm" : "";
      }
    }
    return mt;
  }, [mimeTypePreferred]);

  const stopRecording = useCallback(() => {
    const mr = mrRef.current;
    if (mr && mr.state !== "inactive") {
      try { mr.stop(); } catch {}
    } else {
      // si estaba en VAD esperando voz (sin grabar), limpiamos
      cleanup();
    }
    setIsRecording(false);
  }, [cleanup]);

  const startMediaRecorder = useCallback(
    (stream: MediaStream) => {
      const mt = pickMime();
      const mr = new MediaRecorder(stream, mt ? { mimeType: mt } : undefined);
      mrRef.current = mr;
      chunksRef.current = [];

      startedAtRef.current = Date.now();
      speechMsRef.current = 0;
      lastTickRef.current = Date.now();

      mr.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) chunksRef.current.push(e.data);
      };

      mr.onstop = async () => {
        const blob = new Blob(chunksRef.current, { type: "audio/webm" });
        const elapsed = Date.now() - startedAtRef.current;

        const shouldSend =
          blob.size > 0 &&
          elapsed >= minRecordMs &&
          speechMsRef.current >= minSpeechMsToSend;

        await cleanup();

        if (shouldSend) {
          await onAudioReady(blob);
        }
      };

      mr.start();
      setIsRecording(true);

      // hard stop (PTT o VAD) para que jamás quede colgado
      setTimeout(() => {
        const now = Date.now();
        if (mrRef.current && mrRef.current.state !== "inactive") {
          if (now - startedAtRef.current >= maxRecordMs) stopRecording();
        }
      }, maxRecordMs + 50);
    },
    [cleanup, maxRecordMs, minRecordMs, minSpeechMsToSend, onAudioReady, pickMime, stopRecording]
  );

  const startVadLoop = useCallback(async (stream: MediaStream) => {
    const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
    const ctx = new AudioCtx();
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 2048;
    analyser.smoothingTimeConstant = 0.6;

    const src = ctx.createMediaStreamSource(stream);
    src.connect(analyser);

    audioCtxRef.current = ctx;
    analyserRef.current = analyser;

    const data = new Float32Array(analyser.fftSize);

    let voiceSince = 0;
    let silenceSince = 0;
    let recorderStarted = false;

    const tick = () => {
      const an = analyserRef.current;
      if (!an) return;

      an.getFloatTimeDomainData(data);

      let sum = 0;
      for (let i = 0; i < data.length; i++) sum += data[i] * data[i];
      const rms = Math.sqrt(sum / data.length);

      const now = Date.now();
      const dt = now - (lastTickRef.current || now);
      lastTickRef.current = now;

      // acumular “voz real” (para decidir si mandamos)
      if (recorderStarted && rms >= startThresholdRms) {
        speechMsRef.current += dt;
      }

      // 1) todavía no arrancó a grabar: esperar voz (no manda nada si no hablás)
      if (!recorderStarted) {
        if (rms >= startThresholdRms) {
          if (!voiceSince) voiceSince = now;
          if (now - voiceSince >= startVoiceMs) {
            recorderStarted = true;
            startMediaRecorder(stream);
            silenceSince = 0;
          }
        } else {
          voiceSince = 0;
        }

        rafRef.current = requestAnimationFrame(tick);
        return;
      }

      // 2) grabando: cortar por silencio real (endThreshold)
      if (rms < endThresholdRms) {
        if (!silenceSince) silenceSince = now;
        if (now - silenceSince >= endSilenceMs) {
          stopRecording();
          return;
        }
      } else {
        silenceSince = 0;
      }

      rafRef.current = requestAnimationFrame(tick);
    };

    rafRef.current = requestAnimationFrame(tick);
  }, [endSilenceMs, endThresholdRms, startMediaRecorder, startThresholdRms, startVoiceMs, stopRecording]);

  const startRecording = useCallback(
    async (start: StartOpts) => {
      try {
        await cleanup();
        modeRef.current = start.mode;

        const stream = await navigator.mediaDevices.getUserMedia({
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
          },
        });

        streamRef.current = stream;

        if (start.mode === "ptt") {
          startMediaRecorder(stream); // graba ya
        } else {
          // mode === "vad": espera VOZ para arrancar
          setIsRecording(true); // “estado” UI: escuchando
          startedAtRef.current = Date.now();
          lastTickRef.current = Date.now();
          speechMsRef.current = 0;
          await startVadLoop(stream);
        }
      } catch (e) {
        console.error("[useVoiceRecorder] startRecording error:", e);
        await cleanup();
      }
    },
    [cleanup, startMediaRecorder, startVadLoop]
  );

  return { isRecording, startRecording, stopRecording };
}
