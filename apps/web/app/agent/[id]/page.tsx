//apps\web\app\agent\[id]\page.tsx
"use client";
import Markdown from "@/components/markdown";
import React, { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Home, Send, Loader2, CheckCircle2, AlertCircle, AudioLines, X } from "lucide-react";
import { getAgentById } from "@/lib/agents";
import { useElevenLabsVoice } from "@/hooks/useElevenLabsVoice";
import type { VoiceMessage } from "@/hooks/useElevenLabsVoice";
import VoiceModeModal from "@/components/VoiceModeModal";

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
  const isMobile = /Android|iPhone|iPad|iPod|Opera Mini|IEMobile|WPDesktop/i.test(
    navigator.userAgent
  );
  if (isMobile) {
    window.location.href = url;
  } else {
    window.open(url, "_blank", "noopener,noreferrer");
  }
}

function extractFilesFromMeta(text: string): Array<{ name?: string; id?: string; pages?: string }> {
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

function cleanResponse(text: string): string {
  let cleaned = text.replace(/@@META\s*\{[\s\S]*?\}/g, "").trim();
  cleaned = cleaned.replace(/^@@MISS\s*\{[^\n]*\}\s*\n?/m, "").trim();
  return cleaned;
}

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

function buildSystemPrompt(
  agent: any,
  adminMode: boolean,
  folders: string[] | undefined,
  files: ContextFile[] | null
) {
  let base = String(agent.systemPrompt || "");
  if (adminMode) {
    const folderLine = folders?.length ? folders.join(", ") : "no disponible";
    const filesLine =
      files?.length
        ? files
            .slice(0, 80)
            .map((f) => `${f.name ?? "(sin nombre)"} (${f.id})`)
            .join(" | ")
        : "no disponible";

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

type AgentMessageProps = {
  content: string;
  className?: string;
};

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
  const [toast, setToast] = useState<{ type: "ok" | "err"; msg: string } | null>(null);
  const [lightboxImg, setLightboxImg] = useState<string | null>(null);
  // ── Voz ──
  const [voiceModalOpen, setVoiceModalOpen] = useState(false);

  const endRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const contextRef = useRef<string | null>(null);
  useEffect(() => {
    contextRef.current = contextCache;
  }, [contextCache]);

  const backendBase = process.env.NEXT_PUBLIC_BACKEND_URL || "";

// ── Hook de conversación por voz ──
const {
  state: voiceState,
  messages: voiceMessages,
  error: voiceError,
  startVoiceMode,
  stopVoiceMode,
} = useElevenLabsVoice({
  systemPrompt: agent
    ? buildSystemPrompt(agent, isAdmin, agent.driveFolders, contextFiles) +
      "\n\nContexto documental del producto:\n" + (contextCache ?? "")
    : "",
});
  // ── Handlers de voz ──
  const handleOpenVoice = () => {
    if (!contextLoaded || !agent) return;
    setVoiceModalOpen(true);
    startVoiceMode();
  };

  const handleCloseVoice = () => {
    stopVoiceMode();
    setVoiceModalOpen(false);

    // Volcar mensajes de voz al chat principal al cerrar
    if (voiceMessages.length > 0) {
      const converted: ChatMessage[] = voiceMessages.map((m) => ({
        role: m.role,
        content: m.content,
        ts: m.ts,
      }));
      setMessages((prev) => [...prev, ...converted]);
    }
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

  // Interceptar links de WhatsApp en el chat
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
      await fetch(`${process.env.NEXT_PUBLIC_BACKEND_HEALTH ?? ""}` || "/api/noop").catch(() => {});
      const r = await fetch("/api/context", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ driveFolders: agent.driveFolders, admin: CAN_REQUEST_META }),
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
          content: "🔧 Depuración activada. A partir de ahora puedo incluir metadatos en las respuestas.",
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
            if (assistantRaw.startsWith("@@MISS") && !assistantRaw.includes("\n")) continue;
            assistantMessage.content = cleanResponse(assistantRaw);
            setMessages((prev) => {
              const nm = [...prev];
              nm[nm.length - 1] = { ...assistantMessage };
              return nm;
            });
          } catch {
            // ignorar líneas no JSON
          }
        }
      }

      decoder.decode();
      tryDetectMiss();

      if (!metaExtracted) extractedFiles = extractFilesFromMeta(assistantRaw);

      const isEmpty = !assistantMessage.content || !assistantMessage.content.trim();
      if (isEmpty) {
        if (missSent) {
          assistantMessage.content =
            "No encontré información suficiente en la documentación disponible para responder esa consulta. " +
            "Podés reformular la pregunta o, si lo necesitás, contactar a un asesor de Argental para más detalles.";
        } else {
          assistantMessage.content =
            "No pude generar una respuesta en base a la información disponible. " +
            "Probá reformular la consulta o intentá nuevamente en unos segundos.";
        }
      }

      if (isAdmin && !missSent) {
        const alreadyHasBlock = /Depuración y origen de datos \(solo admin\)/i.test(
          assistantMessage.content
        );
        if (!alreadyHasBlock) {
          const folders =
            Array.isArray(agent?.driveFolders) && agent.driveFolders.length
              ? agent.driveFolders.join(", ")
              : agent?.id ?? "no disponible";

          let filesLine = "";
          const metaById = new Map((contextFiles || []).map((f) => [f.id, f]));

          if (extractedFiles.length > 0) {
            const lines: string[] = [];
            extractedFiles.forEach((f) => {
              const meta = f.id ? metaById.get(f.id) : undefined;
              const dt = meta?.modifiedTime ? new Date(meta.modifiedTime).toLocaleString() : undefined;
              const name = f.name ?? meta?.name ?? "(sin nombre)";
              const parts: string[] = [];
              parts.push(`**${name}**`);
              if (f.id) parts.push(`**ID: **\`${f.id}\``);
              if (dt) parts.push(`**Modif:** ${dt}`);
              if (f.pages) parts.push(`**Págs:** ${f.pages}`);
              lines.push(`- ${parts.join(" · ")}`);
            });
            if (lines.length > 0) filesLine = "\n" + lines.join("\n");
          } else if (contextFiles && contextFiles.length > 0) {
            const lines: string[] = [];
            contextFiles.slice(0, 15).forEach((f) => {
              const dt = f.modifiedTime ? new Date(f.modifiedTime).toLocaleString() : undefined;
              const name = f.name ?? "(sin nombre)";
              const id = f.id ? `**ID:** \`${f.id}\`` : "";
              const extra = dt ? ` · **Modif:** ${dt}` : "";
              lines.push(`- **${name}** · ${id}${extra}`);
            });
            if (contextFiles.length > 15) lines.push(`- _… y ${contextFiles.length - 15} más_`);
            filesLine = "\n" + lines.join("\n");
          } else {
            filesLine = "\n- _(no disponible)_";
          }

          const folderLines = folders
            .split(",")
            .map((f) => f.trim())
            .filter(Boolean)
            .map((f) => `- \`${f}\``)
            .join("\n");

          const adminFooter =
            `\n\n---\n\n` +
            `> 🔧 **Depuración y origen de datos (solo admin)**\n\n` +
            `**📁 Carpetas consultadas**\n` +
            (folderLines ? `${folderLines}\n\n` : `- _(no disponible)_\n\n`) +
            `**📄 Archivos fuente utilizados**` +
            `${filesLine}\n\n` +
            `> ⚡ Modo: ${extractedFiles.length > 0 ? "Citados en respuesta" : "Contexto completo"}`;

          assistantMessage.content += adminFooter;
        }
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
          content: "El servicio de IA está procesando muchas consultas en este momento. Probá de nuevo en unos segundos.",
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
    <div style={{ minHeight: "100vh", background: "#fff" }}>

      {/* HEADER */}
      <header style={{
        position: "sticky", top: 0, zIndex: 10,
        borderBottom: "1px solid var(--border)",
        background: "rgba(255,255,255,.92)",
        backdropFilter: "blur(8px)",
      }}>
        <div style={{
          maxWidth: 900, margin: "0 auto",
          padding: "16px 24px",
          display: "flex", alignItems: "center", gap: 16,
        }}>
          <Link
            href="/"
            onMouseEnter={(e) => (e.currentTarget.style.background = "var(--panel-2)")}
            onMouseLeave={(e) => (e.currentTarget.style.background = "#fff")}
            style={{
              flexShrink: 0, width: 38, height: 38, borderRadius: 10,
              border: "1px solid var(--border-input)", background: "#fff",
              display: "grid", placeItems: "center",
              fontSize: 16, color: "var(--navy)", textDecoration: "none",
            }}
          >
            ←
          </Link>

          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 3 }}>
              <span style={{ width: 7, height: 7, borderRadius: "50%", background: "var(--success)" }} />
              <span style={{
                fontSize: 11, fontWeight: 700, letterSpacing: ".12em",
                textTransform: "uppercase", color: "var(--muted-2)",
              }}>
                Agente de equipo
                {isAdmin && (
                  <span style={{
                    marginLeft: 8, background: "var(--navy)", color: "#fff",
                    fontSize: 10, padding: "2px 8px", borderRadius: 999,
                  }}>Admin</span>
                )}
              </span>
            </div>
            <h2 className="heading-font" style={{
              fontWeight: 600, fontSize: 20, letterSpacing: "-.02em",
              margin: 0, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
              color: "var(--ink)",
            }}>
              {agent.name}
            </h2>
          </div>

          {/* Imagen producto */}
          {(agent as any).image && (
            <div style={{
              flexShrink: 0, width: 92, height: 72, borderRadius: 12,
              overflow: "hidden", border: "1px solid var(--border)",
              background: "var(--panel-2)", cursor: "zoom-in",
            }}
              onClick={() => setLightboxImg((agent as any).imageFull ?? (agent as any).image)}
            >
              <img
                src={(agent as any).image}
                alt={agent.name}
                style={{ width: "100%", height: "100%", objectFit: "contain" }}
              />
            </div>
          )}
        </div>
      </header>

      <main style={{ maxWidth: 900, margin: "0 auto", padding: "0 24px 40px" }}>

        {/* Toast */}
        {toast && (
          <div style={{
            marginTop: 16, display: "flex", alignItems: "center", gap: 8,
            padding: "10px 16px", borderRadius: 12, fontSize: 13,
            background: toast.type === "ok" ? "#f0fdf4" : "#fff1f2",
            border: `1px solid ${toast.type === "ok" ? "#bbf7d0" : "#fecdd3"}`,
            color: toast.type === "ok" ? "#15803d" : "#be123c",
          }}>
            {toast.type === "ok" ? <CheckCircle2 size={14} /> : <AlertCircle size={14} />}
            {toast.msg}
          </div>
        )}

        {/* FAQs */}
        {!!agent.faqs?.length && (
          <div style={{ padding: "18px 0 6px" }}>
            <span style={{
              fontSize: 11, fontWeight: 700, letterSpacing: ".12em",
              textTransform: "uppercase", color: "var(--muted-2)",
            }}>
              Preguntas frecuentes
            </span>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 10 }}>
              {agent.faqs.map((faq: string, i: number) => (
                <button
                  key={i}
                  onClick={() => sendMessage(faq)}
                  disabled={loading || !contextLoaded}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.borderColor = "var(--navy)";
                    e.currentTarget.style.background = "var(--panel-3)";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.borderColor = "var(--border-input)";
                    e.currentTarget.style.background = "#fff";
                  }}
                  style={{
                    border: "1px solid var(--border-input)", background: "#fff",
                    cursor: "pointer", borderRadius: 999, padding: "9px 15px",
                    fontSize: 13, fontWeight: 600, color: "var(--navy)",
                    opacity: loading || !contextLoaded ? 0.5 : 1,
                  }}
                >
                  {faq}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* CHAT */}
        <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 20, padding: "24px 0 8px" }}>

          {/* Loading skeleton */}
          {!contextLoaded && (
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, color: "var(--muted)" }}>
                <Loader2 size={16} className="animate-spin" />
                <span style={{ fontSize: 13 }}>Verificando cambios…</span>
              </div>
              {[180, 120, 200].map((w, i) => (
                <div key={i} style={{
                  display: "flex", justifyContent: i === 1 ? "flex-end" : "flex-start",
                }}>
                  <div style={{
                    height: 56, width: `${w}px`, borderRadius: 16,
                    background: "var(--panel-2)", animation: "pulse 1.5s infinite",
                  }} />
                </div>
              ))}
            </div>
          )}

          {/* Mensajes */}
          {messages.map((m, i) => {
            const mine = m.role === "user";
            return (
              <div
                key={i}
                style={{
                  display: "flex", flexDirection: "column", gap: 12,
                  animation: "bqfade .3s ease both",
                }}
              >
                <div style={{
                  display: "flex", gap: 12, alignItems: "flex-start",
                  justifyContent: mine ? "flex-end" : "flex-start",
                }}>
                  {/* Avatar Busquetti */}
                  {!mine && (
                    <div style={{
                      flexShrink: 0, width: 36, height: 36, borderRadius: "50%",
                      background: "var(--navy)", display: "grid", placeItems: "center",
                      fontFamily: "'Archivo', sans-serif", fontWeight: 700,
                      fontSize: 15, color: "var(--gold)",
                    }}>
                      B
                    </div>
                  )}

                  {/* Burbuja */}
                  <div style={{
                    maxWidth: "76%", padding: "14px 17px",
                    borderRadius: mine ? "16px 16px 4px 16px" : "4px 16px 16px 16px",
                    background: mine ? "var(--navy)" : "var(--panel-3)",
                    color: mine ? "#fff" : "var(--ink)",
                    fontSize: 14.5, lineHeight: 1.6,
                    border: `1px solid ${mine ? "var(--navy)" : "var(--border)"}`,
                  }}>
                    {mine ? (
                      <Markdown className="whitespace-pre-wrap leading-relaxed">{m.content}</Markdown>
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
                    <div style={{
                      marginTop: 4, fontSize: 11,
                      color: mine ? "rgba(255,255,255,.5)" : "var(--muted-3)",
                    }}>
                      {mine ? "Vos" : agent.name} · {formatTime(m.ts)}
                    </div>
                  </div>

                  {/* Avatar usuario */}
                  {mine && (
                    <div style={{
                      flexShrink: 0, width: 32, height: 32, borderRadius: "50%",
                      background: "var(--ink)", display: "grid", placeItems: "center",
                    }}>
                      <span style={{ color: "#fff", fontSize: 11, fontWeight: 700 }}>Vos</span>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
          <div ref={endRef} />
        </div>

        {/* COMPOSER */}
        <div style={{
          position: "sticky", bottom: 0,
          background: "linear-gradient(to bottom, rgba(255,255,255,0), #fff 22%)",
          padding: "14px 0 0",
        }}>
          <div style={{
            display: "flex", alignItems: "flex-end", gap: 10,
            border: "1px solid var(--border-input)", borderRadius: 16,
            padding: "10px 10px 10px 16px", background: "#fff",
            boxShadow: "0 10px 26px -20px rgba(15,17,21,.4)",
          }}>
            <textarea
              ref={inputRef}
              rows={1}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyPress}
              disabled={loading || !contextLoaded}
              placeholder={contextLoaded ? "Escribí tu pregunta…" : "Cargando contexto…"}
              style={{
                flex: 1, border: "none", outline: "none", resize: "none",
                fontSize: 14.5, lineHeight: 1.5, padding: "10px 0",
                color: "var(--ink)", background: "transparent", maxHeight: 120,
              }}
            />

            {/* Voz */}
            <button
              type="button"
              onClick={handleOpenVoice}
              disabled={loading || !contextLoaded}
              title="Modo conversación por voz"
              onMouseEnter={(e) => {
                e.currentTarget.style.borderColor = "var(--navy)";
                e.currentTarget.style.color = "var(--navy)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.borderColor = "var(--border-input)";
                e.currentTarget.style.color = "var(--muted-2)";
              }}
              style={{
                flexShrink: 0, width: 40, height: 40, borderRadius: 11,
                border: "1px solid var(--border-input)", background: "#fff",
                color: "var(--muted-2)", cursor: "pointer", fontSize: 15,
                display: "grid", placeItems: "center",
                opacity: loading || !contextLoaded ? 0.5 : 1,
              }}
            >
              <AudioLines size={16} />
            </button>

            {/* Enviar */}
            <button
              onClick={() => sendMessage()}
              disabled={loading || !contextLoaded || !input.trim()}
              onMouseEnter={(e) => (e.currentTarget.style.background = "var(--navy)")}
              onMouseLeave={(e) => (e.currentTarget.style.background = "var(--ink)")}
              style={{
                flexShrink: 0, height: 40, padding: "0 20px",
                border: "none", borderRadius: 11, background: "var(--ink)",
                color: "#fff", fontSize: 14, fontWeight: 600, cursor: "pointer",
                display: "flex", alignItems: "center", gap: 6,
                opacity: loading || !contextLoaded || !input.trim() ? 0.5 : 1,
              }}
            >
              {loading ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
              {loading ? "Enviando" : "Enviar"}
            </button>
          </div>

          {CAN_REQUEST_META && isAdmin && (
            <div style={{ marginTop: 6, fontSize: 11, color: "var(--muted-2)" }}>
              Depuración: ACTIVADA
            </div>
          )}

          <p style={{
            margin: "14px 0 0", fontSize: 11.5, lineHeight: 1.6,
            color: "var(--muted-3)", textAlign: "center",
          }}>
            El uso de los Agentes Argental implica la aceptación de la{" "}
            <a href="/politicas-de-uso-Argental" target="_blank" rel="noopener noreferrer"
              style={{ color: "var(--navy)" }}>
              Política de Uso y Limitación de Responsabilidad
            </a>
            .
          </p>
        </div>
      </main>

      {/* Lightbox */}
      {lightboxImg && (
        <div
          style={{
            position: "fixed", inset: 0, zIndex: 50,
            display: "flex", alignItems: "center", justifyContent: "center",
            background: "rgba(0,0,0,.75)", backdropFilter: "blur(8px)",
          }}
          onClick={() => setLightboxImg(null)}
        >
          <div style={{ position: "relative", maxWidth: 560, width: "100%", margin: "0 24px" }}
            onClick={(e) => e.stopPropagation()}>
            <button
              onClick={() => setLightboxImg(null)}
              style={{
                position: "absolute", top: -40, right: 0,
                background: "rgba(255,255,255,.1)", border: "none",
                borderRadius: "50%", width: 32, height: 32,
                color: "#fff", cursor: "pointer", fontSize: 16,
              }}
            >
              <X size={16} />
            </button>
            <img src={lightboxImg} alt="Producto"
              style={{ width: "100%", height: "auto", borderRadius: 16 }} />
          </div>
        </div>
      )}

      {/* Modal voz */}
      <VoiceModeModal
        open={voiceModalOpen}
        onClose={handleCloseVoice}
        state={voiceState}
        messages={voiceMessages}
        error={voiceError}
        agentName={agent.name}
      />
    </div>
  );
}