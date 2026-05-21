//web/app/page.tsx
"use client";
import Link from "next/link";
import Markdown from "@/components/markdown";
import FooterPolicy from "@/components/FooterPolicy";
import { useVoiceRecorder } from "@/hooks/useVoiceRecorder";

import BusquettiBanner from "@/components/BusquettiBanner";
import React, { useMemo, useEffect, useRef, useState } from "react";
import {
  Home,
  Sparkles,
  Send,
  Loader2,
  CheckCircle2,
  AlertCircle,
  MessageSquareText,
  X,
} from "lucide-react";
import Image from "next/image";

// 👇 importá los agentes desde el registry central
import { AGENTS } from "@/lib/agents";

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

const IS_ADMIN = process.env.NEXT_PUBLIC_ADMIN === "1";
function formatTime(ts?: number) {
  if (!ts) return "";
  const d = new Date(ts);
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

// util de búsqueda: ignora tildes y mayúsculas
const norm = (s: string) =>
  (s || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "");

// (opcional) si usás @@MISS en el prompt, lo podés reportar acá
async function reportMiss(miss: any) {
  const base = (process.env.NEXT_PUBLIC_BACKEND_URL || "").replace(/\/$/, "");
  const url = base ? `${base}/api/agent/log-miss` : "/api/agent/log-miss";
  try {
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

export default function MultiAgentChat() {
  const [selectedAgent, setSelectedAgent] = useState<any>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [contextLoaded, setContextLoaded] = useState(false);
  const [contextCache, setContextCache] = useState<string | null>(null);
  const [toast, setToast] = useState<{ type: "ok" | "err"; msg: string } | null>(null);
  const [contextFiles, setContextFiles] = useState<ContextFile[] | null>(null);
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("asc"); // ← ACÁ, fuera del componente

  // ── Lightbox ──
  const [lightboxImg, setLightboxImg] = useState<string | null>(null);

  // filtros (solo afectan la vista de lista)
  const [familyFilter, setFamilyFilter] = useState<string>("");
  const [subfamilyFilter, setSubfamilyFilter] = useState<string>("");
  const [nameFilter, setNameFilter] = useState<string>("");

  // opciones únicas para selects
  const families = useMemo(
    () => Array.from(new Set(AGENTS.map((a) => a.family))).sort(),
    []
  );
  const subfamilies = useMemo(() => {
    const subset = familyFilter ? AGENTS.filter((a) => a.family === familyFilter) : AGENTS;
    return Array.from(new Set(subset.map((a) => a.subfamily))).sort();
  }, [familyFilter]);

  // lista filtrada para la grilla
const filteredAgents = useMemo(() => {
  const nf = norm(nameFilter);
  return AGENTS.filter((a) => {
    const okFamily = familyFilter ? a.family === familyFilter : true;
    const okSubfamily = subfamilyFilter ? a.subfamily === subfamilyFilter : true;
    const haystack = norm([a.id, a.name, a.family, a.subfamily, a.description].filter(Boolean).join(" "));
    const okName = !nf || haystack.includes(nf);
    return okFamily && okSubfamily && okName;
  }).sort((a, b) => {
    const cmp = norm(a.name).localeCompare(norm(b.name));
    return sortOrder === "asc" ? cmp : -cmp;
  });
}, [familyFilter, subfamilyFilter, nameFilter, sortOrder]);

  // resetear subfamilia cuando cambia familia
  useEffect(() => setSubfamilyFilter(""), [familyFilter]);

  // cerrar lightbox con Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") setLightboxImg(null);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  const endRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const backendBase = (process.env.NEXT_PUBLIC_BACKEND_URL || "").replace(/\/$/, "");

  const { isRecording, startRecording, stopRecording } = useVoiceRecorder(
    async (audioBlob) => {
      if (!backendBase) {
        console.error("Falta NEXT_PUBLIC_BACKEND_URL");
        setToast({ type: "err", msg: "No está configurado el backend de audio." });
        setTimeout(() => setToast(null), 2500);
        return;
      }

      if (!selectedAgent) {
        console.error("No hay agente seleccionado para enviar el audio.");
        return;
      }

      if (!contextLoaded || !contextCache) {
        setToast({ type: "err", msg: "Todavía no se cargó la documentación del agente." });
        setTimeout(() => setToast(null), 2500);
        return;
      }

      setLoading(true);
      setToast(null);

      try {
        const formData = new FormData();
        formData.append("audio", audioBlob, "audio.webm");
        formData.append("agentId", selectedAgent.id);
        formData.append("systemPrompt", selectedAgent.systemPrompt);
        formData.append("context", contextCache);
        formData.append("sessionId", `voice-${selectedAgent.id}-${Date.now()}`);

        const res = await fetch(`${backendBase}/api/voice-chat`, {
          method: "POST",
          body: formData,
        });

        const data = await res.json();

        if (!data.ok) {
          console.error("Error /voice-chat:", data);
          setToast({ type: "err", msg: "No pude procesar el audio. Probá de nuevo." });
          setTimeout(() => setToast(null), 2500);
          return;
        }

        const question: string = data.question;
        const answer: string | null = data.answer;

        setMessages((prev) => {
          const now = Date.now();
          const updated: ChatMessage[] = [...prev, { role: "user", content: question, ts: now }];
          if (answer) updated.push({ role: "assistant", content: answer, ts: now });
          return updated;
        });
      } catch (e) {
        console.error("Error enviando audio:", e);
        setToast({ type: "err", msg: "Error enviando audio al servidor." });
        setTimeout(() => setToast(null), 2500);
      } finally {
        setLoading(false);
      }
    }
  );

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    if (selectedAgent && !contextLoaded) loadContext();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedAgent]);

  // autosize textarea
  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = "0px";
    el.style.height = Math.min(el.scrollHeight, 200) + "px";
  }, [input]);

  const loadContext = async () => {
    if (!selectedAgent?.driveFolders) return;
    setLoading(true);
    setToast(null);
    try {
      await fetch(`${process.env.NEXT_PUBLIC_BACKEND_HEALTH ?? ""}` || "/api/noop").catch(() => {});

      const r = await fetch("/api/context", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          driveFolders: selectedAgent.driveFolders,
          admin: IS_ADMIN,
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
      setMessages([
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

  const sendMessage = async () => {
    if (!input.trim() || loading || !contextLoaded) return;

    const userMessage: ChatMessage = { role: "user", content: input.trim(), ts: Date.now() };
    setMessages((prev) => [...prev, userMessage]);
    setInput("");
    setLoading(true);

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "text/event-stream" },
        body: JSON.stringify({
          messages: [...messages, userMessage],
          systemPrompt: selectedAgent.systemPrompt,
          context: contextCache,
        }),
      });

      if (!response.ok || !response.body) throw new Error("Error en la respuesta");

      const reader = response.body.getReader();
      const decoder = new TextDecoder("utf-8");

      let assistantMessage: ChatMessage = { role: "assistant", content: "", ts: Date.now() };
      setMessages((prev) => [...prev, assistantMessage]);

      let buf = "";
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
            const delta = parsed.choices?.[0]?.delta?.content;
            if (delta) {
              assistantMessage.content += delta;
              setMessages((prev) => {
                const nm = [...prev];
                nm[nm.length - 1] = { ...assistantMessage };
                return nm;
              });

              const maybeMiss = assistantMessage.content.trim();
              if (maybeMiss.startsWith("@@MISS{") && maybeMiss.endsWith("}")) {
                try {
                  const json = JSON.parse(maybeMiss.replace(/^@@MISS/, ""));
                  reportMiss(json);
                } catch {}
              }
            }
          } catch {
            // líneas no JSON -> ignorar
          }
        }
      }
      decoder.decode();
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

  const selectAgent = (agent: any) => {
    setSelectedAgent(agent);
    setMessages([]);
    setContextLoaded(false);
    setContextCache(null);
    setContextFiles(null);
    setToast(null);
  };

  const goBack = () => {
    setSelectedAgent(null);
    setMessages([]);
    setContextLoaded(false);
    setContextCache(null);
    setContextFiles(null);
    setToast(null);
  };

  // ---------- VISTA: LISTA DE AGENTES ----------
  if (!selectedAgent) {
    return (
      <div className="min-h-screen bg-white">
        <header className="border-b bg-white/70 backdrop-blur">
          <div className="mx-auto max-w-6xl px-4 py-5 flex items-center justify-between">
            <div className="flex items-center gap-4 flex-wrap">
              <Image
                src="/LOGO.png"
                alt="Argental Avanza"
                width={260}
                height={84}
                className="h-20 md:h-24 w-auto object-contain shrink-0"
                priority
              />
              <p className="text-[11px] leading-relaxed text-gray-600 mt-1">
                El uso de los Agentes Argental implica la aceptación de la siguiente{" "}
                <a
                  href="/politicas-de-uso-Argental"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-600 hover:underline"
                >
                  Política de Uso y Limitación de Responsabilidad
                </a>
                .
              </p>
            </div>
          </div>
        </header>

        <main className="mx-auto max-w-6xl px-4 py-8">
          <BusquettiBanner />
          <div className="mb-10">
            <h1 className="text-4xl font-bold tracking-tight text-gray-900">Busquetti | Multi-Agentes IA</h1>
            <p className="mt-2 text-gray-600">Seleccioná un agente para comenzar</p>
          </div>

          {/* 🔎 Barra de filtros */}
          <div className="mb-6 grid gap-3 sm:grid-cols-4">
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">Categoría</label>
              <select
                value={familyFilter}
                onChange={(e) => setFamilyFilter(e.target.value)}
                className="w-full rounded-lg border px-3 py-2 text-sm"
              >
                <option value="">Todas</option>
                {families.map((f) => (
                  <option key={f} value={f}>{f}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">Subcategoría</label>
              <select
                value={subfamilyFilter}
                onChange={(e) => setSubfamilyFilter(e.target.value)}
                disabled={!subfamilies.length}
                className="w-full rounded-lg border px-3 py-2 text-sm disabled:bg-gray-50"
              >
                <option value="">Todas</option>
                {subfamilies.map((sf) => (
                  <option key={sf} value={sf}>{sf}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">Búsqueda</label>
              <input
                value={nameFilter}
                onChange={(e) => setNameFilter(e.target.value)}
                placeholder="Buscar por Categoría, Nombre y más..."
                className="w-full rounded-lg border px-3 py-2 text-sm"
              />
            </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Ordenar</label>
            <select
              value={sortOrder}
              onChange={(e) => setSortOrder(e.target.value as "asc" | "desc")}
              className="w-full rounded-lg border px-3 py-2 text-sm"
            >
              <option value="asc">A → Z</option>
              <option value="desc">Z → A</option>
            </select>
          </div>
        </div>

          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
  {filteredAgents.map((agent) => (
    <div
      key={agent.id}
      className="group relative overflow-hidden rounded-2xl border bg-white p-6 text-left shadow-sm transition-all hover:shadow-xl"
    >
      <div
        className={`pointer-events-none absolute inset-0 bg-gradient-to-br ${agent.accent} opacity-0 transition-opacity group-hover:opacity-10`}
      />
      <div className="relative">
        {(agent as any).image && (
          <div className="mb-3 flex justify-center h-28">
            <img
              src={(agent as any).image}
              alt={agent.name}
              className="h-full w-auto object-contain cursor-zoom-in hover:scale-105 transition-transform duration-200"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setLightboxImg((agent as any).imageFull ?? (agent as any).image);
              }}
            />
          </div>
        )}

        <div className="mt-3 flex flex-wrap gap-2 text-xs">
          <span className="rounded-full border px-2 py-0.5 text-gray-600">{agent.family}</span>
          <span className="rounded-full border px-2 py-0.5 text-gray-600">{agent.subfamily}</span>
        </div>

        <h3 className="mt-3 text-xl font-semibold text-gray-900">{agent.name}</h3>

        <div className="mt-6 flex justify-center">
          <Link
  href={`/agent/${agent.id}`}
  className="inline-flex items-center rounded-xl bg-gray-900 px-4 py-2 text-sm font-semibold text-white shadow-sm transition-all duration-200 hover:bg-black hover:shadow-md hover:scale-105 active:scale-95"
>
  Iniciar chat
</Link>
        </div>
      </div>
    </div>
  ))}
</div>
          {filteredAgents.length === 0 && (
            <div className="mt-6 rounded-xl border bg-gray-50 p-6 text-sm text-gray-600">
              No se encontraron agentes con esos filtros.
            </div>
          )}

          <footer className="mx-auto max-w-6xl pb-10 pt-6 text-center text-xs text-gray-500 space-y-2">
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

        {/* ── Lightbox ── */}
        {lightboxImg && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm"
            onClick={() => setLightboxImg(null)}
          >
            <div
              className="relative max-w-xl w-full mx-6"
              onClick={(e) => e.stopPropagation()}
            >
              <button
                onClick={() => setLightboxImg(null)}
                className="absolute -top-10 right-0 inline-flex items-center justify-center rounded-full bg-white/10 p-1.5 text-white hover:bg-white/20 transition"
              >
                <X className="size-5" />
              </button>
              <img
                src={lightboxImg}
                alt="Producto"
                className="w-full h-auto rounded-2xl shadow-2xl"
              />
            </div>
          </div>
        )}
      </div>
    );
  }

  // ---------- VISTA: CHAT ----------
  return (
    <div className="min-h-screen bg-white">
      <header className="sticky top-0 z-10 border-b bg-white/80 backdrop-blur">
        <div className="mx-auto max-w-4xl px-4 py-3 flex items-center justify-between">
          <button
            onClick={goBack}
            className="inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            <Home className="size-4" />
            Volver
          </button>

          <div className="flex flex-col items-center">
            <div className="inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs text-gray-600">
              <span className="relative flex size-2">
                <span className="absolute inline-flex size-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                <span className="relative inline-flex size-2 rounded-full bg-emerald-500" />
              </span>
              Activo
            </div>

            <h2 className="mt-2 text-lg font-semibold text-gray-900">{selectedAgent.name}</h2>
            <p className="text-xs text-gray-500">{selectedAgent.description}</p>
          </div>

          <div className="w-[84px]" />
        </div>
      </header>

      <main className="mx-auto max-w-4xl px-4 pb-24">
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

        {IS_ADMIN && contextFiles && contextFiles.length > 0 && (
          <div className="mt-4 rounded-xl border bg-white p-4 text-sm">
            <div className="mb-2 font-semibold">📂 Documentos cargados ({contextFiles.length})</div>
            <ul className="max-h-56 overflow-auto space-y-1">
              {contextFiles.map((f, i) => (
                <li key={f.id ?? i} className="flex items-center justify-between gap-2">
                  <div className="truncate">
                    <div className="truncate">
                      {f.name ?? "(sin nombre)"}{" "}
                      <span className="text-gray-400">({f.mimeType || "desconocido"})</span>
                    </div>
                    <div className="text-[11px] text-gray-500 truncate">
                      ID: {f.id} · Carpeta: {f.folderId || "-"} ·{" "}
                      {f.modifiedTime ? new Date(f.modifiedTime).toLocaleString() : ""}
                    </div>
                  </div>
                  <a
                    href={`https://drive.google.com/file/d/${f.id}/view`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-blue-600 hover:underline shrink-0"
                  >
                    Abrir
                  </a>
                </li>
              ))}
            </ul>
          </div>
        )}

        {!!selectedAgent.faqs?.length && (
          <div className="mt-6 flex flex-wrap gap-2">
            {selectedAgent.faqs.map((faq: string, i: number) => (
              <button
                key={i}
                onClick={() => setInput(faq)}
                disabled={loading || !contextLoaded}
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
                <div key={i} className={`mb-3 flex ${mine ? "justify-end" : "justify-start"}`}>
                  <div
                    className={`w-fit max-w-[85%] rounded-2xl px-5 py-3 text-sm leading-6 ${
                      mine ? "bg-gray-900 text-white shadow-md" : "border bg-white text-gray-900 shadow-sm"
                    }`}
                  >
                    <Markdown
                      className={
                        mine
                          ? "whitespace-pre-wrap leading-relaxed"
                          : "prose prose-sm sm:prose-base max-w-none whitespace-pre-wrap leading-relaxed [&_p]:mb-3 [&_ul]:my-3 [&_ol]:my-3 [&_li]:my-1 [&_strong]:block [&_strong]:mt-4 [&_strong]:mb-1"
                      }
                    >
                      {m.content}
                    </Markdown>

                    <div className={`mt-1 text-[11px] ${mine ? "text-gray-300" : "text-gray-500"}`}>
                      {mine ? "Vos" : selectedAgent.name} · {formatTime(m.ts)}
                    </div>
                  </div>
                </div>
              );
            })}
            <div ref={endRef} />
          </div>

          <div className="sticky bottom-0 border-t bg-white p-3 sm:p-4">
            <div className="flex items-end gap-3">
              <button
                type="button"
                onClick={isRecording ? stopRecording : startRecording}
                disabled={loading || !contextLoaded}
                className={`mb-1 inline-flex items-center justify-center rounded-full border px-3 py-3 text-sm shadow-sm transition ${
                  isRecording
                    ? "bg-red-500 text-white border-red-500"
                    : "bg-white text-gray-700 hover:bg-gray-50"
                } disabled:cursor-not-allowed disabled:opacity-50`}
                title={isRecording ? "Detener grabación" : "Hablar por micrófono"}
              >
                {isRecording ? "■" : "🎙"}
              </button>

              <textarea
                ref={inputRef}
                rows={1}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyPress}
                disabled={loading || !contextLoaded}
                placeholder={contextLoaded ? "Escribí tu pregunta…" : "Cargando contexto…"}
                className="max-h-[200px] flex-1 resize-none rounded-xl border px-4 py-3 text-sm text-gray-900 placeholder:text-gray-400 focus:border-gray-900 focus:outline-none disabled:cursor-not-allowed disabled:bg-gray-50"
              />

              <button
                onClick={sendMessage}
                disabled={loading || !contextLoaded || !input.trim()}
                className="inline-flex items-center gap-2 rounded-2xl bg-gray-900 px-5 py-3 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-black disabled:cursor-not-allowed disabled:opacity-50"
              >
                {loading ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
                {loading ? "Enviando" : "Enviar"}
              </button>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}