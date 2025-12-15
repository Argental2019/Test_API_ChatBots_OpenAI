// hooks/useVoiceRecorder.ts
import { useState, useRef, useCallback } from 'react';

export function useVoiceRecorder(onAudioReady: (blob: Blob) => Promise<void>) {
  const [isRecording, setIsRecording] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  // Detectar silencio automáticamente
  const detectSilence = useCallback((stream: MediaStream, onSilence: () => void) => {
    const audioContext = new AudioContext();
    const analyser = audioContext.createAnalyser();
    const microphone = audioContext.createMediaStreamSource(stream);
    
    analyser.fftSize = 512;
    analyser.smoothingTimeConstant = 0.8;
    microphone.connect(analyser);

    audioContextRef.current = audioContext;
    analyserRef.current = analyser;

    const dataArray = new Uint8Array(analyser.frequencyBinCount);
    let silenceStart = Date.now();
    const SILENCE_THRESHOLD = 30; // Ajustá este valor si es muy sensible
    const SILENCE_DURATION = 1500; // 1.5 segundos de silencio

    const checkAudio = () => {
      if (!analyser) return;
      
      analyser.getByteFrequencyData(dataArray);
      const average = dataArray.reduce((sum, value) => sum + value, 0) / dataArray.length;

      if (average < SILENCE_THRESHOLD) {
        if (Date.now() - silenceStart > SILENCE_DURATION) {
          onSilence();
          return;
        }
      } else {
        silenceStart = Date.now();
      }

      requestAnimationFrame(checkAudio);
    };

    checkAudio();
  }, []);

  const startRecording = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ 
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        } 
      });

      streamRef.current = stream;
      chunksRef.current = [];

      const mediaRecorder = new MediaRecorder(stream, {
        mimeType: 'audio/webm;codecs=opus'
      });

      mediaRecorderRef.current = mediaRecorder;

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          chunksRef.current.push(e.data);
        }
      };

      mediaRecorder.onstop = async () => {
        const blob = new Blob(chunksRef.current, { type: 'audio/webm' });
        
        // Limpiar recursos
        if (streamRef.current) {
          streamRef.current.getTracks().forEach(track => track.stop());
          streamRef.current = null;
        }
        if (audioContextRef.current) {
          audioContextRef.current.close();
          audioContextRef.current = null;
        }

        if (blob.size > 0) {
          await onAudioReady(blob);
        }

        chunksRef.current = [];
      };

      mediaRecorder.start();
      setIsRecording(true);

      // Detectar silencio para detener automáticamente
      detectSilence(stream, () => {
        stopRecording();
      });

    } catch (error) {
      console.error('Error al iniciar grabación:', error);
      setIsRecording(false);
    }
  }, [onAudioReady, detectSilence]);

  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
    }
  }, []);

  return {
    isRecording,
    startRecording,
    stopRecording,
  };
}