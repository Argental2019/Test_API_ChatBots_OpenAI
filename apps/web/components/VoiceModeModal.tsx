// apps/web/components/VoiceModeModal.tsx
"use client";

import React from "react";
import { X, Loader2 } from "lucide-react";
import { VoiceState, VoiceMessage } from "@/hooks/useElevenLabsVoice";

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

  const isListening = state === "listening" || state === "interrupted";
  const isSpeaking  = state === "speaking";
  const isIdle      = state === "idle";

  const videoSrc = isSpeaking
    ? "/busquetti/BusquettiHablando.mp4"
    : "/busquetti/BusquettiEsperando.mp4";

  const hint = isSpeaking
    ? "Hablá para interrumpir"
    : isListening
    ? "Te estoy escuchando…"
    : "";

  const accentColor = isSpeaking ? "#3b82f6" : isListening ? "#10b981" : "#6b7280";
  const accentLabel = isSpeaking ? "text-blue-500" : isListening ? "text-emerald-500" : "text-gray-400";
  const dotColor    = isSpeaking ? "bg-blue-500 animate-pulse" : isListening ? "bg-emerald-500 animate-pulse" : "bg-gray-400";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-md" />

      {/* Card */}
      <div className="relative z-10 flex flex-col items-center w-full max-w-sm mx-4 rounded-3xl bg-white shadow-2xl overflow-hidden">

        {/* Header con color de acento */}
        <div
          className="w-full flex items-center justify-between px-5 py-4"
          style={{ backgroundColor: accentColor + "15", borderBottom: `1px solid ${accentColor}25` }}
        >
          <div className="flex items-center gap-2">
            <span className={`inline-block size-2 rounded-full ${dotColor}`} />
            <p className={`text-sm font-semibold ${accentLabel}`}>{STATE_LABELS[state]}</p>
          </div>
          <button
            onClick={onClose}
            className="flex items-center justify-center size-8 rounded-full bg-gray-100 text-gray-400 hover:bg-gray-200 hover:text-gray-700 transition-colors"
          >
            <X className="size-4" />
          </button>
        </div>

        {/* Nombre agente */}
        <p className="mt-4 text-xs font-semibold tracking-widest uppercase text-gray-400">
          {agentName}
        </p>

        {/* Personaje */}
        <div className="flex items-end justify-center w-full h-64 px-6">
          {isIdle ? (
            <div className="flex items-center justify-center h-full">
              <Loader2 className="size-10 text-gray-300 animate-spin" />
            </div>
          ) : (
            <video
              key={videoSrc}
              src={videoSrc}
              autoPlay
              loop
              playsInline
              className="h-full w-auto object-contain"
            />
          )}
        </div>

        {/* Hint */}
        <p className="mt-2 mb-2 text-xs text-gray-400 text-center min-h-[16px]">
          {hint}
        </p>

        {/* Error */}
        {error && (
          <div className="mx-5 mb-3 rounded-xl bg-rose-50 border border-rose-200 px-4 py-2 text-xs text-rose-500 text-center">
            {error}
          </div>
        )}

        {/* Footer */}
        <div className="pb-5 text-center">
          <p className="text-gray-300 text-xs">
            Cerrá para ver la conversación en el chat
          </p>
        </div>
      </div>
    </div>
  );
}