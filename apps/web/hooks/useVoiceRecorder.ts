import { useCallback, useRef, useState } from "react";

export type StartOpts = { mode: "ptt" | "vad" };

type Options = {
  mimeTypePreferred?: string;

  // VAD thresholds
  startThresholdRms?: number;
  startVoiceMs?: number;
  endThresholdRms?: number;
  endSilenceMs?: number;

  // Anti-vacíos / performance
  minRecordMs?: number;        // mínimo total de grabación para enviar
  minSpeechMsToSend?: number;  // mínimo de “voz real” para enviar
  maxRecordMs?: number;        // hard stop (solo cuando ya grabó)
};

export function useVoiceRecorder(
  onAudioReady: (blob: Blob) => Promise<void>,
  opts: Options = {}
) {
  const {
    mimeTypePreferred = "audio/webm;codecs=opus",

    startThresholdRms = 0.045,
    startVoiceMs = 180,
    endThresholdRms = 0.02,
    endSilenceMs = 900,

    minRecordMs = 350,
    minSpeechMsToSend = 180,
    maxRecordMs = 6500,
  } = opts;

  // “activo” (grabando o escuchando VAD)
  const [isRecording, setIsRecording] = useState(false);

  const streamRef = useRef<MediaStream | null>(null);
  const mrRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  const audioCtxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const rafRef = useRef<number | null>(null);

  const startedAtRef = useRef(0);
  const speechMsRef = useRef(0);
  const lastTickRef = useRef(0);

  const hardStopTimerRef = useRef<number | null>(null);

  const stopRaf = () => {
    if (rafRef.current != null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
  };

  const stopHardTimer = () => {
    if (hardStopTimerRef.current != null) {
      window.clearTimeout(hardStopTimerRef.current);
      hardStopTimerRef.current = null;
    }
  };

  const cleanup = useCallback(async () => {
    stopRaf();
    stopHardTimer();

    if (audioCtxRef.current) {
      try {
        await audioCtxRef.current.close();
      } catch {}
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

    // si está grabando: corta y onstop arma blob
    if (mr && mr.state !== "inactive") {
      try {
        mr.stop();
      } catch {}
      setIsRecording(false);
      return;
    }

    // si estaba en VAD “escuchando” sin grabar: solo limpiar (NO mandar nada)
    cleanup();
  }, [cleanup]);

  const ensureAnalyser = useCallback(async (stream: MediaStream) => {
    const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
    const ctx = new AudioCtx();
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 2048;
    analyser.smoothingTimeConstant = 0.6;

    const src = ctx.createMediaStreamSource(stream);
    src.connect(analyser);

    audioCtxRef.current = ctx;
    analyserRef.current = analyser;
  }, []);

  const calcRms = (data: Float32Array) => {
    let sum = 0;
    for (let i = 0; i < data.length; i++) sum += data[i] * data[i];
    return Math.sqrt(sum / data.length);
  };

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
        try {
          const mime = mr.mimeType || "audio/webm";
          const blob = new Blob(chunksRef.current, { type: mime });
          const elapsed = Date.now() - startedAtRef.current;

          const shouldSend =
            blob.size > 0 &&
            elapsed >= minRecordMs &&
            speechMsRef.current >= minSpeechMsToSend;

          chunksRef.current = [];

          await cleanup();

          // ✅ si no hubo “voz real”, NO enviamos (evita loop de silencio)
          if (shouldSend) {
            await onAudioReady(blob);
          }
        } catch (err) {
          console.error("[useVoiceRecorder] onstop error:", err);
          await cleanup();
        }
      };

      mr.start();
      setIsRecording(true);

      // hard stop SOLO cuando está grabando
      stopHardTimer();
      hardStopTimerRef.current = window.setTimeout(() => {
        const cur = mrRef.current;
        if (cur && cur.state !== "inactive") {
          if (Date.now() - startedAtRef.current >= maxRecordMs) stopRecording();
        }
      }, maxRecordMs + 50);
    },
    [
      cleanup,
      maxRecordMs,
      minRecordMs,
      minSpeechMsToSend,
      onAudioReady,
      pickMime,
      stopRecording,
    ]
  );

  const startVadLoop = useCallback(
    async (stream: MediaStream) => {
      await ensureAnalyser(stream);

      const an = analyserRef.current!;
      const data = new Float32Array(an.fftSize);

      let voiceSince = 0;
      let silenceSince = 0;
      let recorderStarted = false;

      const tick = () => {
        const analyser = analyserRef.current;
        if (!analyser) return;

        analyser.getFloatTimeDomainData(data);
        const rms = calcRms(data);

        const now = Date.now();
        const dt = now - (lastTickRef.current || now);
        lastTickRef.current = now;

        // ✅ acumular voz real (para decidir si mandamos)
        if (recorderStarted && rms >= startThresholdRms) {
          speechMsRef.current += dt;
        }

        // 1) esperar voz (NO corta por silencio si no hablás)
        if (!recorderStarted) {
          if (rms >= startThresholdRms) {
            if (!voiceSince) voiceSince = now;
            if (now - voiceSince >= startVoiceMs) {
              recorderStarted = true;
              silenceSince = 0;
              startMediaRecorder(stream);
            }
          } else {
            voiceSince = 0;
          }

          rafRef.current = requestAnimationFrame(tick);
          return;
        }

        // 2) grabando: cortar cuando hay silencio REAL
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
    },
    [
      ensureAnalyser,
      endSilenceMs,
      endThresholdRms,
      startMediaRecorder,
      startThresholdRms,
      startVoiceMs,
      stopRecording,
    ]
  );

  // ✅ startRecording() default = PTT (para no romper llamadas viejas)
  const startRecording = useCallback(
    async (start: StartOpts = { mode: "ptt" }) => {
      try {
        await cleanup();
        setIsRecording(true);

        const stream = await navigator.mediaDevices.getUserMedia({
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
          },
        });

        streamRef.current = stream;

        if (start.mode === "ptt") {
          // PTT: graba YA, pero igual medimos “voz real” para no mandar vacíos
          await ensureAnalyser(stream);

          // arrancar recorder ya
          startMediaRecorder(stream);

          // loop liviano para acumular speechMsRef mientras se graba
          const an = analyserRef.current!;
          const data = new Float32Array(an.fftSize);

          const pttTick = () => {
            const analyser = analyserRef.current;
            const mr = mrRef.current;
            if (!analyser || !mr || mr.state === "inactive") return;

            analyser.getFloatTimeDomainData(data);
            const rms = calcRms(data);

            const now = Date.now();
            const dt = now - (lastTickRef.current || now);
            lastTickRef.current = now;

            if (rms >= startThresholdRms) speechMsRef.current += dt;

            rafRef.current = requestAnimationFrame(pttTick);
          };

          lastTickRef.current = Date.now();
          rafRef.current = requestAnimationFrame(pttTick);
          return;
        }

        // VAD: espera voz para arrancar (y NO manda nada si no hablás)
        startedAtRef.current = Date.now();
        speechMsRef.current = 0;
        lastTickRef.current = Date.now();
        await startVadLoop(stream);
      } catch (e) {
        console.error("[useVoiceRecorder] startRecording error:", e);
        await cleanup();
      }
    },
    [cleanup, ensureAnalyser, startMediaRecorder, startVadLoop, startThresholdRms]
  );

  return { isRecording, startRecording, stopRecording };
}
