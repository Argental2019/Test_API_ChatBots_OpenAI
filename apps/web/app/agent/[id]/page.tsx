"use client";
import Markdown from "@/components/markdown";
import React, { useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  Home,
  Send,
  Loader2,
  CheckCircle2,
  AlertCircle,
  Mic,
  AudioLines,
} from "lucide-react";
import { getAgentById } from "@/lib/agents";
import { useVoiceRecorder } from "@/hooks/useVoiceRecorder";

type VoiceState = "idle" | "listening" | "processing" | "speaking";
type ChatMessage = { role: "user" | "assistant"; content: string; ts?: number };

type ContextFile = {
  id: string;
  name?: string;
  mimeType?: string;
  modifiedTime?: string;
  size?: number;
  etag?: string;
  folderId?: string;
};

const CAN_REQUEST_META = process.env.NEXT_PUBLIC_ADMIN === "1";

const AUDIO_NOISE_PATTERNS = [
  "subtítulos realizados por la comunidad de amara.org",
  "subtitulos realizados por la comunidad de amara.org",
  "gracias por ver el video",
  "gracias por ver el vídeo",
  "no olvides suscribirte",
  "no olvides suscribirte al canal",
  "suscríbete al canal",
  "suscribete al canal",
  "activa la campanita",
  "dale like y comparte",
  "presionando el boton",
];

function formatTime(ts?: number) {
  if (!ts) return "";
  const d = new Date(ts);
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

/* ===== helper para registrar misses ===== */
async function reportMiss(miss: any) {
  try {
    const url = "/api/agent/log-miss";
    const r = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(miss),
    });
    if (!r.ok) console.warn("log-miss failed", await r.text());
  } catch (e) {
    console.warn("log-miss error", e);
  }
}

function openWhatsApp() {
  const url = "https://wa.me/5493415470737";
  const isMobile =
    /Android|iPhone|iPad|iPod|Opera Mini|IEMobile|WPDesktop/i.test(
      navigator.userAgent
    );

  if (isMobile) window.location.href = url;
  else window.open(url, "_blank", "noopener,noreferrer");
}

/* ===== Extraer archivos desde @@META (sin mostrarlo) ===== */
function extractFilesFromMeta(
  text: string
): Array<{ name?: string; id?: string; pages?: string }> {
  const rx = /@@META\s*(\{[\s\S]*?\})/;
  const m = text.match(rx);
  if (!m) return [];
  try {
    const json = JSON.parse(m[1]);
    if (!json?.files) return [];
    if (Array.isArray(json.files)) {
      return json.files
        .filter(Boolean)
        .map((f: any) => ({ name: f?.name, id: f?.id, pages: f?.pages }));
    }
    return [];
  } catch {
    return [];
  }
}

/* ===== Limpiar @@META y @@MISS de la respuesta visible ===== */
function cleanResponse(text: string): string {
  let cleaned = text.replace(/@@META\s*\{[\s\S]*?\}/g, "").trim();
  cleaned = cleaned.replace(/^@@MISS\s*\{[^\n]*\}\s*\n?/m, "").trim();
  return cleaned;
}

/* ===== Separar resumen (línea 1) y desarrollo (resto) ===== */
function splitAgentResponse(text: string): { summary: string; detail: string } {
  if (!text) return { summary: "", detail: "" };

  const lines = text.split("\n");
  const summary = (lines[0] ?? "").trim();

  let firstDetailIndex = -1;
  for (let i = 1; i < lines.length; i++) {
    if (lines[i].trim() !== "") {
      firstDetailIndex = i;
      break;
    }
  }

  const detail =
    firstDetailIndex === -1
      ? ""
      : lines.slice(firstDetailIndex).join("\n").trim();

  return { summary, detail };
}

/* ===== Admin builder: inyecta bloque de depuración ===== */
function buildSystemPrompt(
  agent: any,
  adminMode: boolean,
  folders: string[] | undefined,
  files: ContextFile[] | null
) {
  let base = String(agent.systemPrompt || "");

  if (adminMode) {
    base += `

🔐 ADMIN MODE (activo)
Al final de cada respuesta exitosa (cuando SÍ hay información disponible), agregá ÚNICAMENTE:

@@META {"files":[{"name":"nombre del archivo usado","id":"id_del_archivo","pages":"páginas relevantes si aplica"}]}

IMPORTANTE:
- @@META solo se usa cuando respondés con información válida.
- NO uses @@META si no hay respuesta disponible.
- La línea @@META es técnica y NO debe incluir explicaciones visibles al usuario.
- El bloque de depuración lo agregará el sistema automáticamente.
`;
  } else {
    base += `

🔒 MODO PÚBLICO
Prohibido mencionar nombres/IDs de Drive o rutas internas.
`;
  }

  base += `

## 🧾 Registro de preguntas sin respaldo (@@MISS)
Si NO podés responder con la documentación disponible:
1) En la primera línea devolvé EXACTAMENTE:
@@MISS {"reason":"sin_fuente","query":"<pregunta_usuario>","need":"<qué falta>"}
2) En las líneas siguientes, explicá al usuario en lenguaje claro por qué no podés responder.

NOTA: @@MISS y @@META son mutuamente excluyentes. Usá uno u otro, nunca ambos.
`;

  return base;
}

type AgentMessageProps = { content: string; className?: string };

function AgentMessage({ content, className }: AgentMessageProps) {
  const [expanded, setExpanded] = useState(false);
  const { summary, detail } = splitAgentResponse(content);
  const hasDetail = !!detail;

  return (
    <div>
      <Markdown className={className}>{summary}</Markdown>

      {hasDetail && !expanded && (
        <button
          type="button"
          onClick={() => setExpanded(true)}
          className="mt-2 text-xs font-semibold text-blue-600 hover:underline"
        >
          VER MÁS
        </button>
      )}

      {hasDetail && expanded && (
        <>
          <button
            type="button"
            onClick={() => setExpanded(false)}
            className="mt-2 text-xs font-semibold text-blue-600 hover:underline"
          >
            VER MENOS
          </button>
          <div className="mt-2">
            <Markdown className={className}>{detail}</Markdown>
          </div>
        </>
      )}
    </div>
  );
}

export default function AgentChatPage({ params }: { params: { id: string } }) {
  const agent = getAgentById(params.id);

  const [isAdmin, setIsAdmin] = useState(false);

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);

  const [contextLoaded, setContextLoaded] = useState(false);
  const [contextCache, setContextCache] = useState<string | null>(null);
  const [contextFiles, setContextFiles] = useState<ContextFile[] | null>(null);

  const [toast, setToast] = useState<{ type: "ok" | "err"; msg: string } | null>(
    null
  );

  // ====== MODO VOZ EN EL MISMO CHAT ======
  const [voiceEnabled, setVoiceEnabled] = useState(false);
  const [voiceState, setVoiceState] = useState<VoiceState>("idle");

  const voiceEnabledRef = useRef(false);
  useEffect(() => {
    voiceEnabledRef.current = voiceEnabled;
  }, [voiceEnabled]);

  const audioRef = useRef<HTMLAudioElement | null>(null);

  const endRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const contextRef = useRef<string | null>(null);
  useEffect(() => {
    contextRef.current = contextCache;
  }, [contextCache]);

  const backendBase = process.env.NEXT_PUBLIC_BACKEND_URL || "";

  const stopSpeakingNow = () => {
    if (audioRef.current) {
      try {
        audioRef.current.pause();
        audioRef.current.currentTime = 0;
      } catch {}
      audioRef.current = null;
    }
  };

  // ========= PROCESO DE AUDIO (un turno) =========
  const processAudioOnce = async (audioBlob: Blob) => {
    if (!agent || !contextLoaded || !contextRef.current) return;

    // Si viene de modo voz, mostramos estados; si viene de PTT, no “ensuciamos” tanto
    const comingFromVoiceMode = voiceEnabledRef.current;
    if (comingFromVoiceMode) setVoiceState("processing");

    try {
      const systemPromptForVoice = buildSystemPrompt(
        agent,
        isAdmin,
        agent.driveFolders,
        contextFiles
      );

      const formData = new FormData();
      formData.append("audio", audioBlob, "audio.webm");
      formData.append("agentId", agent.id);
      formData.append("systemPrompt", systemPromptForVoice);
      formData.append("context", contextRef.current);
      formData.append("sessionId", `voice-${agent.id}-${Date.now()}`);

      const base = backendBase.replace(/\/$/, "");
      const res = await fetch(`${base}/api/voice-chat`, {
        method: "POST",
        body: formData,
      });

      const data = await res.json();
      if (!data.ok) throw new Error(data.error || "Error en voice-chat");

      let question: string = (data.question || "").trim();
      let answer: string = cleanResponse(String(data.answer || ""));

      // ✅ Si no hay texto (silencio), SOLO en modo voz: NO mostrar nada, volver a escuchar
      if (!question) {
        if (voiceEnabledRef.current) {
          setVoiceState("listening");
          // volver a escuchar (VAD)
          setTimeout(() => startRecording({ mode: "vad" }), 150);
        }
        return;
      }

      // filtro ruido / cosas raras (si viene ruido, en modo voz NO queremos loop infinito)
      const qLower = question.toLowerCase();
      const looksLikeNoise =
        AUDIO_NOISE_PATTERNS.some((p) => qLower.includes(p)) ||
        question.length < 3;

      if (looksLikeNoise) {
        // En modo voz: no insertes "📣 ..." (solo reescuchar)
        if (voiceEnabledRef.current) {
          setVoiceState("listening");
          setTimeout(() => startRecording({ mode: "vad" }), 200);
          return;
        }
        // En PTT (cuando el usuario apretó el mic), sí avisamos que no se entendió
        question = "🎙️ (audio no claro)";
        if (!answer?.trim()) answer = "No pude entender el audio. Probá de nuevo.";
      }

      if (!answer.trim()) {
        answer = "No encontré información suficiente en la documentación disponible.";
      }

      // ✅ todo en el MISMO chat
      const now = Date.now();
      setMessages((prev) => [
        ...prev,
        { role: "user", content: question, ts: now },
        { role: "assistant", content: answer, ts: now },
      ]);

      // === TTS ===
      stopSpeakingNow();

      if (voiceEnabledRef.current) setVoiceState("speaking");

      if (data.audioBase64) {
        const mime = data.mimeType || "audio/mpeg";
        const a = new Audio(`data:${mime};base64,${data.audioBase64}`);
        audioRef.current = a;

        a.onended = () => {
          audioRef.current = null;
          if (voiceEnabledRef.current) {
            setVoiceState("listening");
            setTimeout(() => startRecording({ mode: "vad" }), 150);
          } else {
            setVoiceState("idle");
          }
        };

        await a.play().catch((e) => {
          console.warn("[voice] play() failed:", e);
          audioRef.current = null;

          // si el navegador bloquea autoplay, no lo fuerces: quedate en idle/listening
          if (voiceEnabledRef.current) {
            setVoiceState("listening");
            setTimeout(() => startRecording({ mode: "vad" }), 200);
          } else {
            setVoiceState("idle");
          }
        });
      } else {
        // Sin audio devuelto: seguimos igual
        if (voiceEnabledRef.current) {
          setVoiceState("listening");
          setTimeout(() => startRecording({ mode: "vad" }), 200);
        } else {
          setVoiceState("idle");
        }
      }
    } catch (e) {
      console.error("[voice] error:", e);
      if (voiceEnabledRef.current) setVoiceState("idle");
      setToast({ type: "err", msg: "Error en audio/voz. Probá de nuevo." });
      setTimeout(() => setToast(null), 2500);
    }
  };

  // ✅ Hook NUEVO (con modo ptt / vad)
  const { isRecording, startRecording, stopRecording } = useVoiceRecorder(
    processAudioOnce,
    {
      startThresholdRms: 0.045,
      startVoiceMs: 180,
      endThresholdRms: 0.02,
      endSilenceMs: 900,
      minRecordMs: 450,
      maxRecordMs: 6500,
      minSpeechMsToSend: 220,
    }
  );

  const toggleVoice = () => {
    if (!contextLoaded) {
      setToast({ type: "err", msg: "Esperá a que se cargue la documentación." });
      setTimeout(() => setToast(null), 2500);
      return;
    }

    if (voiceEnabledRef.current) {
      // OFF
      setVoiceEnabled(false);
      setVoiceState("idle");
      try {
        stopRecording();
      } catch {}
      stopSpeakingNow();
    } else {
      // ON
      setVoiceEnabled(true);
      setVoiceState("listening");
      stopSpeakingNow();
      // ✅ VAD: espera voz real
      startRecording({ mode: "vad" });
    }
  };

  const interruptAndListen = () => {
    stopSpeakingNow();
    if (!voiceEnabledRef.current) return;

    try {
      stopRecording();
    } catch {}

    setVoiceState("listening");
    setTimeout(() => startRecording({ mode: "vad" }), 120);
  };

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    if (agent && !contextLoaded) loadContext();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [agent]);

  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = "0px";
    el.style.height = Math.min(el.scrollHeight, 200) + "px";
  }, [input]);

  if (!agent) {
    return (
      <div className="mx-auto max-w-4xl p-6">
        <p className="text-sm text-gray-600">Agente no encontrado.</p>
        <Link
          href="/"
          className="mt-3 inline-flex items-center gap-2 text-sm text-gray-700 underline"
        >
          <Home className="size-4" /> Volver al inicio
        </Link>
      </div>
    );
  }

  useEffect(() => {
    const links = document.querySelectorAll<HTMLAnchorElement>("a[href*='wa.me']");
    const handler = (e: MouseEvent) => {
      e.preventDefault();
      openWhatsApp();
    };
    links.forEach((a) => a.addEventListener("click", handler));
    return () => links.forEach((a) => a.removeEventListener("click", handler));
  }, [messages]);

  const loadContext = async () => {
    if (!agent?.driveFolders) return;
    setLoading(true);
    setToast(null);

    try {
      await fetch(`${process.env.NEXT_PUBLIC_BACKEND_HEALTH ?? ""}` || "/api/noop").catch(
        () => {}
      );

      const r = await fetch("/api/context", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          driveFolders: agent.driveFolders,
          admin: CAN_REQUEST_META,
        }),
      });

      if (!r.ok) throw new Error(await r.text());

      const data = await r.json();
      setContextCache(data.context || "");
      setContextFiles(Array.isArray(data.files) ? data.files : null);
      setContextLoaded(true);

      setToast({ type: "ok", msg: "Documentación cargada correctamente." });
      setTimeout(() => setToast(null), 2500);
    } catch (e) {
      console.error(e);
      setToast({ type: "err", msg: "No pude cargar el contexto documental." });
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: "No pude cargar el contexto documental. Intentá nuevamente.",
          ts: Date.now(),
        },
      ]);
    } finally {
      setLoading(false);
    }
  };

  const sendMessage = async (text?: string) => {
    const content = (text ?? input).trim();
    if (!content || loading || !contextLoaded) return;

    if (content === "##DEBUGARGENTAL##") {
      setIsAdmin(true);
      setInput("");
      setToast({ type: "ok", msg: "🔧 Admin Mode activado para este chat." });
      setTimeout(() => setToast(null), 2000);
      setMessages((prev) => [
        ...prev,
        { role: "user", content, ts: Date.now() },
        {
          role: "assistant",
          content:
            "🔧 Depuración activada. A partir de ahora puedo incluir metadatos en las respuestas.",
          ts: Date.now(),
        },
      ]);
      return;
    }

    const userMessage: ChatMessage = { role: "user", content, ts: Date.now() };
    const history = [...messages, userMessage];

    setMessages(history);
    setInput("");
    setLoading(true);

    try {
      const systemPrompt = buildSystemPrompt(agent, isAdmin, agent.driveFolders, contextFiles);

      const response = await fetch("/api/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "text/event-stream",
        },
        body: JSON.stringify({
          messages: history,
          systemPrompt,
          context: contextCache,
          adminMode: isAdmin,
        }),
      });

      if (!response.ok || !response.body) throw new Error("Error en la respuesta");

      const reader = response.body.getReader();
      const decoder = new TextDecoder("utf-8");

      let assistantMessage: ChatMessage = { role: "assistant", content: "", ts: Date.now() };
      setMessages((prev) => [...prev, assistantMessage]);

      let assistantRaw = "";
      let buf = "";
      let missSent = false;
      let metaExtracted = false;
      let extractedFiles: Array<{ name?: string; id?: string; pages?: string }> = [];

      const tryDetectMiss = () => {
        if (missSent) return;
        const rx = /@@MISS\s*(\{[\s\S]*?\})/;
        const m = assistantRaw.match(rx);
        if (!m) return;
        const jsonRaw = m[1];

        try {
          const miss = JSON.parse(jsonRaw);
          reportMiss({
            agentId: agent.id,
            query: miss.query,
            reason: miss.reason || "desconocido",
            need: miss.need || "revisar_fuente",
            ts: Date.now(),
            uiVersion: process.env.NEXT_PUBLIC_APP_VERSION || "dev",
          });
          missSent = true;
        } catch (e) {
          console.warn("MISS parse error", e, jsonRaw);
        }
      };

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;

        buf += decoder.decode(value, { stream: true });

        let idx: number;
        while ((idx = buf.indexOf("\n")) >= 0) {
          const line = buf.slice(0, idx);
          buf = buf.slice(idx + 1);

          if (!line.startsWith("data: ")) continue;
          const data = line.slice(6).trim();
          if (data === "[DONE]") continue;

          try {
            const parsed = JSON.parse(data);
            const delta: string | undefined = parsed.choices?.[0]?.delta?.content;
            if (!delta) continue;

            assistantRaw += delta;

            tryDetectMiss();

            if (!metaExtracted && assistantRaw.includes("@@META")) {
              extractedFiles = extractFilesFromMeta(assistantRaw);
              if (extractedFiles.length > 0) metaExtracted = true;
            }

            if (assistantRaw.startsWith("@@MISS") && !assistantRaw.includes("\n")) {
              continue;
            }

            assistantMessage.content = cleanResponse(assistantRaw);

            setMessages((prev) => {
              const nm = [...prev];
              nm[nm.length - 1] = { ...assistantMessage };
              return nm;
            });
          } catch {
            // ignore
          }
        }
      }

      decoder.decode();
      tryDetectMiss();

      if (!metaExtracted) extractedFiles = extractFilesFromMeta(assistantRaw);

      const isEmpty = !assistantMessage.content || !assistantMessage.content.trim();
      if (isEmpty) {
        assistantMessage.content = missSent
          ? "No encontré información suficiente en la documentación disponible para responder esa consulta. Podés reformular la pregunta."
          : "No pude generar una respuesta en base a la información disponible. Probá nuevamente.";
      }

      setMessages((prev) => {
        const nm = [...prev];
        nm[nm.length - 1] = { ...assistantMessage };
        return nm;
      });
    } catch (error) {
      console.error(error);
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content:
            "El servicio de IA está procesando muchas consultas en este momento. Probá de nuevo en unos segundos.",
          ts: Date.now(),
        },
      ]);
    } finally {
      setLoading(false);
      inputRef.current?.focus();
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  return (
    <div className="min-h-screen bg-white">
      <header className="sticky top-0 z-10 border-b bg-white/80 backdrop-blur">
        <div className="relative mx-auto max-w-4xl px-4 py-3 flex items-center">
          <Link
            href="/"
            className="absolute left-4 inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            <Home className="size-4" />
            Volver
          </Link>

          <div className="mx-auto text-center pointer-events-none">
            <div className="inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs text-gray-600">
              <span className="relative flex size-2">
                <span className="absolute inline-flex size-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                <span className="relative inline-flex size-2 rounded-full bg-emerald-500" />
              </span>
              Activo{" "}
              {isAdmin && (
                <span className="ml-2 rounded-full bg-gray-900 px-2 py-0.5 text-white">
                  Admin
                </span>
              )}
            </div>

            <div className="mt-1 text-[11px] text-gray-500 leading-snug">
              <div>
                Categoría:{" "}
                <span className="font-medium text-gray-700">{agent.family || "-"}</span>
              </div>
              <div>
                Subcategoría:{" "}
                <span className="font-medium text-gray-700">{agent.subfamily || "-"}</span>
              </div>
            </div>

            <h2 className="mt-2 text-base font-semibold text-gray-900 leading-tight">
              {agent.name}
            </h2>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-4xl px-4">
        {toast && (
          <div
            className={`mt-4 flex items-center gap-2 rounded-xl border px-4 py-3 text-sm ${
              toast.type === "ok"
                ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                : "border-rose-200 bg-rose-50 text-rose-700"
            }`}
          >
            {toast.type === "ok" ? <CheckCircle2 className="size-4" /> : <AlertCircle className="size-4" />}
            {toast.msg}
          </div>
        )}

        {!!agent.faqs?.length && (
          <div className="mt-6 flex flex-wrap gap-2">
            {agent.faqs.map((faq: string, i: number) => (
              <button
                key={i}
                onClick={() => sendMessage(faq)}
                disabled={loading || !contextLoaded || voiceEnabled}
                className="rounded-full border bg-white px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {faq}
              </button>
            ))}
          </div>
        )}

        <section className="mt-6 rounded-2xl border bg-white shadow-sm">
          <div className="max-h-[64vh] overflow-y-auto p-4 sm:p-6">
            {!contextLoaded && (
              <div className="space-y-4">
                <div className="flex items-center gap-3 text-gray-700">
                  <Loader2 className="size-5 animate-spin" />
                  <span>Verificando cambios…</span>
                </div>

                <div className="flex justify-start">
                  <div className="h-16 w-3/4 max-w-[520px] animate-pulse rounded-2xl bg-gray-100" />
                </div>
                <div className="flex justify-end">
                  <div className="h-12 w-2/3 max-w-[420px] animate-pulse rounded-2xl bg-gray-100" />
                </div>
                <div className="flex justify-start">
                  <div className="h-24 w-4/5 max-w-[560px] animate-pulse rounded-2xl bg-gray-100" />
                </div>
              </div>
            )}

            {messages.map((m, i) => {
              const mine = m.role === "user";
              return (
                <div
                  key={i}
                  className={`mb-3 flex ${mine ? "justify-end" : "justify-start"}`}
                >
                  <div
                    className={`w-fit max-w-[85%] rounded-2xl px-5 py-3 text-sm leading-6 ${
                      mine
                        ? "bg-gray-900 text-white shadow-md"
                        : "border bg-white text-gray-900 shadow-sm"
                    }`}
                  >
                    {mine ? (
                      <Markdown className="whitespace-pre-wrap leading-relaxed">
                        {m.content}
                      </Markdown>
                    ) : (
                      <AgentMessage
                        content={m.content}
                        className={[
                          "prose prose-sm sm:prose-base max-w-none leading-relaxed",
                          "[&_p]:my-2 [&_ul]:my-2 [&_ol]:my-2 [&_li]:my-0.5",
                          "[&_p:has(>strong:only-child)]:mt-4",
                          "[&_p:has(>strong:only-child)]:mb-1",
                        ].join(" ")}
                      />
                    )}

                    <div
                      className={`mt-1 text-[11px] ${
                        mine ? "text-gray-300" : "text-gray-500"
                      }`}
                    >
                      {mine ? "Vos" : agent.name} · {formatTime(m.ts)}
                    </div>
                  </div>
                </div>
              );
            })}

            <div ref={endRef} />
          </div>

          {/* Composer */}
          <div className="sticky bottom-0 border-t bg-white p-3 sm:p-4">
            <div className="flex items-end gap-3">
              <textarea
                ref={inputRef}
                rows={1}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyPress}
                disabled={loading || !contextLoaded || voiceEnabled}
                placeholder={
                  voiceEnabled
                    ? voiceState === "listening"
                      ? "Modo voz: escuchando..."
                      : voiceState === "processing"
                      ? "Modo voz: procesando..."
                      : voiceState === "speaking"
                      ? "Modo voz: respondiendo..."
                      : "Modo voz activo..."
                    : contextLoaded
                    ? "Escribí tu pregunta…"
                    : "Cargando contexto…"
                }
                className="max-h-[200px] flex-1 resize-none rounded-xl border px-4 py-3 text-sm text-gray-900 placeholder:text-gray-400 focus:border-gray-900 focus:outline-none disabled:cursor-not-allowed disabled:bg-gray-50"
              />

              {/* Mic (PTT) - SIEMPRE PTT */}
              <button
                type="button"
                onClick={() => {
                  // si está hablando y el usuario toca el mic: barge-in
                  if (voiceEnabled && voiceState === "speaking") {
                    interruptAndListen();
                    return;
                  }
                  if (isRecording) stopRecording();
                  else startRecording({ mode: "ptt" });
                }}
                disabled={loading || !contextLoaded}
                className={`mb-1 inline-flex items-center justify-center rounded-full border px-3 py-3 text-sm shadow-sm transition ${
                  isRecording
                    ? "bg-red-500 text-white border-red-500"
                    : "bg-white text-gray-700 hover:bg-gray-50"
                } disabled:cursor-not-allowed disabled:opacity-50`}
                title={isRecording ? "Detener grabación" : "Hablar por micrófono"}
              >
                <Mic className="size-4" />
              </button>

              {/* Botón “Modo voz” */}
              <button
                type="button"
                onClick={() => {
                  if (voiceEnabled && voiceState === "speaking") {
                    interruptAndListen();
                    return;
                  }
                  toggleVoice();
                }}
                disabled={loading || !contextLoaded}
                className={`mb-1 inline-flex items-center gap-2 rounded-full border px-4 py-3 text-sm shadow-sm transition ${
                  voiceEnabled
                    ? "bg-blue-600 text-white border-blue-600"
                    : "bg-white text-gray-700 hover:bg-gray-50"
                } disabled:cursor-not-allowed disabled:opacity-50`}
                title={
                  !voiceEnabled
                    ? "Activar modo voz"
                    : voiceState === "listening"
                    ? "Modo voz: escuchando (click para apagar)"
                    : voiceState === "processing"
                    ? "Modo voz: procesando (click para apagar)"
                    : voiceState === "speaking"
                    ? "Modo voz: hablando (click para interrumpir)"
                    : "Modo voz activo (click para apagar)"
                }
              >
                <AudioLines className="size-4" />
                {voiceEnabled ? "Modo voz ON" : "Modo voz"}
              </button>

              {/* Enviar */}
              <button
                onClick={() => sendMessage()}
                disabled={loading || !contextLoaded || !input.trim() || voiceEnabled}
                className="inline-flex items-center gap-2 rounded-2xl bg-gray-900 px-5 py-3 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-black disabled:cursor-not-allowed disabled:opacity-50"
              >
                {loading ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
                {loading ? "Enviando" : "Enviar"}
              </button>
            </div>

            {CAN_REQUEST_META && (
              <div className="mt-2 text-[11px] text-gray-500">
                {isAdmin ? "Depuración: ACTIVADA" : ""}
              </div>
            )}
          </div>
        </section>

        <footer className="mx-auto max-w-4xl py-6 mt-6 border-t text-center text-xs text-gray-500 space-y-2">
          <p>© {new Date().getFullYear()} Argental · Asistentes</p>
          <p className="text-[11px] leading-relaxed">
            El uso de los Agentes Argental implica la aceptación de la siguiente{" "}
            <a
              href="/politicas-de-uso-Argental"
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-600 hover:underline"
            >
              Política de Uso y Limitación de Responsabilidad de los Agentes Argental
            </a>
            .
          </p>
        </footer>
      </main>
    </div>
  );
}
