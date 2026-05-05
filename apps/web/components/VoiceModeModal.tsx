// apps/web/components/VoiceModeModal.tsx
"use client";

import React from "react";
import { X, Loader2 } from "lucide-react";
import { VoiceState, VoiceMessage } from "@/hooks/useRealtimeVoice";

type Props = {
  open: boolean;
  onClose: () => void;
  state: VoiceState;
  messages: VoiceMessage[];
  error: string | null;
  agentName: string;
};

const STATE_LABELS: Record<VoiceState, string> = {
  idle: "Iniciando…",
  listening: "Escuchando",
  speaking: "Respondiendo",
  interrupted: "Escuchando",
};

export default function VoiceModeModal({
  open,
  onClose,
  state,
  messages,
  error,
  agentName,
}: Props) {
  if (!open) return null;

  const isListening  = state === "listening" || state === "interrupted";
  const isSpeaking   = state === "speaking";
  const isIdle       = state === "idle";

  // Colores según estado
  const barColor = isSpeaking ? "bg-blue-400" : isListening ? "bg-emerald-400" : "bg-gray-600";
  const dotColor = isSpeaking
    ? "bg-blue-400 animate-pulse"
    : isListening
    ? "bg-emerald-400 animate-pulse"
    : "bg-gray-600";

  const hint = isSpeaking
    ? "Hablá para interrumpir"
    : isListening
    ? "Te estoy escuchando…"
    : "";

  // Alturas de barras
  const listeningHeights = ["h-4", "h-8", "h-14", "h-8", "h-4"];
  const speakingHeights  = ["h-6", "h-12", "h-20", "h-12", "h-6"];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/75 backdrop-blur-lg" />

      {/* Card */}
      <div
        className="relative z-10 flex flex-col items-center w-full max-w-xs mx-4 rounded-3xl bg-gray-950 shadow-2xl"
        style={{ height: "400px" }}
      >
        {/* Cerrar */}
        <div className="w-full flex justify-end px-5 pt-5">
          <button
            onClick={onClose}
            className="flex items-center justify-center size-9 rounded-full bg-white/10 text-gray-400 hover:bg-white/20 hover:text-white transition-colors"
          >
            <X className="size-4" />
          </button>
        </div>

        {/* Contenido central */}
        <div className="flex flex-col items-center justify-center flex-1 gap-7 w-full px-6">
          {/* Nombre agente */}
          <p className="text-white/40 text-xs font-semibold tracking-widest uppercase">
            {agentName}
          </p>

          {/* Visualizador */}
          <div className="flex items-center justify-center gap-2 h-24">
            {isIdle ? (
              <Loader2 className="size-10 text-gray-500 animate-spin" />
            ) : (
              [0, 1, 2, 3, 4].map((i) => (
                <div
                  key={i}
                  className={`w-1.5 rounded-full transition-all duration-300 ${barColor} ${
                    isSpeaking
                      ? speakingHeights[i]
                      : isListening
                      ? listeningHeights[i]
                      : "h-1"
                  }`}
                  style={
                    isListening || isSpeaking
                      ? {
                          animation: `voiceBar ${0.5 + i * 0.08}s ease-in-out infinite alternate`,
                          animationDelay: `${i * 0.09}s`,
                        }
                      : undefined
                  }
                />
              ))
            )}
          </div>

          {/* Estado */}
          <div className="flex items-center gap-2">
            <span className={`inline-block size-2 rounded-full ${dotColor}`} />
            <p className="text-white/60 text-sm">{STATE_LABELS[state]}</p>
          </div>

          {/* Hint */}
          <p className="text-white/25 text-xs text-center min-h-[16px]">
            {hint}
          </p>
        </div>

        {/* Error */}
        {error && (
          <div className="mx-5 mb-3 rounded-xl bg-rose-500/20 border border-rose-500/30 px-4 py-2 text-xs text-rose-300 text-center">
            {error}
          </div>
        )}

        {/* Footer */}
        <div className="pb-5 text-center">
          <p className="text-white/20 text-xs">
            Cerrá para ver la conversación en el chat
          </p>
        </div>
      </div>

      <style>{`
        @keyframes voiceBar {
          0%   { transform: scaleY(0.3); opacity: 0.5; }
          100% { transform: scaleY(1.4); opacity: 1;   }
        }
      `}</style>
    </div>
  );
}