"use client";
import Markdown from "@/components/markdown";
import React, { useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  Home,
  Sparkles,
  Send,
  Loader2,
  CheckCircle2,
  AlertCircle,
} from "lucide-react";

import { AGENTS, getAgentById } from "@/lib/agents";

type ChatMessage = { role: "user" | "assistant"; content: string; ts?: number };

function formatTime(ts?: number) {
  if (!ts) return "";
  const d = new Date(ts);
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

export default function AgentChatPage({ params }: { params: { id: string } }) {
  const agent = getAgentById(params.id);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [contextLoaded, setContextLoaded] = useState(false);
  const [contextCache, setContextCache] = useState<string | null>(null);
  const [toast, setToast] = useState<{ type: "ok" | "err"; msg: string } | null>(null);

  const endRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    if (agent && !contextLoaded) {
      loadContext();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [agent]);

  // autosize textarea
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
        <Link href="/" className="mt-3 inline-flex items-center gap-2 text-sm text-gray-700 underline">
          <Home className="size-4" /> Volver al inicio
        </Link>
      </div>
    );
  }

  const loadContext = async () => {
    if (!agent?.driveFolders) return;
    setLoading(true);
    setToast(null);
    try {
      // “wake up” opcional (si usás health en el backend)
      await fetch(`${process.env.NEXT_PUBLIC_BACKEND_HEALTH ?? ""}` || "/api/noop").catch(() => {});

      const r = await fetch("/api/context", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ driveFolders: agent.driveFolders }),
      });
      if (!r.ok) throw new Error(await r.text());
      const data = await r.json();
      setContextCache(data.context || "");
      setContextLoaded(true);
      setToast({ type: "ok", msg: "Documentación cargada correctamente." });
      setTimeout(() => setToast(null), 2500);
    } catch (e) {
      console.error(e);
      setToast({ type: "err", msg: "No pude cargar el contexto documental." });
      setMessages([
        { role: "assistant", content: "No pude cargar el contexto documental. Intentá nuevamente.", ts: Date.now() },
      ]);
    } finally {
      setLoading(false);
    }
  };

  // AHORA ACEPTA TEXTO OPCIONAL (para enviar FAQs directo)
  const sendMessage = async (text?: string) => {
    const content = (text ?? input).trim();
    if (!content || loading || !contextLoaded) return;

    const userMessage: ChatMessage = { role: "user", content, ts: Date.now() };
    const history = [...messages, userMessage];

    setMessages(history);
    setInput(""); // limpiamos el textarea si venía escribiendo
    setLoading(true);

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "text/event-stream",
        },
        body: JSON.stringify({
          messages: history,
          systemPrompt: agent.systemPrompt,
          context: contextCache,
        }),
      });

      if (!response.ok || !response.body) throw new Error("Error en la respuesta");

      // Streaming SSE robusto (UTF-8)
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
          content: "Error generando respuesta. Verificá la configuración del servidor.",
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
  {/* contenedor RELATIVE y altura fija */}
  <div className="relative mx-auto max-w-4xl px-4 h-24 flex items-center">
    {/* Izquierda: botón volver (absolute) */}
    <Link
      href="/"
      className="absolute left-4 inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
    >
      <Home className="size-4" />
      Volver
    </Link>

    {/* Centro: SIEMPRE centrado */}
    <div className="mx-auto text-center pointer-events-none">
      <div className="inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs text-gray-600">
        <span className="relative flex size-2">
          <span className="absolute inline-flex size-full animate-ping rounded-full bg-emerald-400 opacity-75" />
          <span className="relative inline-flex size-2 rounded-full bg-emerald-500" />
        </span>
        Activo
      </div>
      <h2 className="mt-1 text-base font-semibold text-gray-900 leading-tight">{agent.name}</h2>
      <p className="text-[11px] text-gray-500">{agent.description}</p>
    </div>
    {/* (Logo eliminado) */}
  </div>
</header>


      <main className="mx-auto max-w-4xl px-4">
        {/* Toast */}
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

        {/* FAQs */}
        {!!agent.faqs?.length && (
          <div className="mt-6 flex flex-wrap gap-2">
            {agent.faqs.map((faq: string, i: number) => (
              <button
                key={i}
                onClick={() => sendMessage(faq)} // ← ahora envía directo
                disabled={loading || !contextLoaded}
                className="rounded-full border bg-white px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {faq}
              </button>
            ))}
          </div>
        )}

        {/* Chat */}
        <section className="mt-6 rounded-2xl border bg-white shadow-sm">
          <div className="max-h-[64vh] overflow-y-auto p-4 sm:p-6">
            {!contextLoaded && (
              <div className="space-y-4">
                <div className="flex items-center gap-3 text-gray-700">
                  <Loader2 className="size-5 animate-spin" />
                  <span>Verificando cambios…</span>
                </div>

                {/* Skeleton bubbles */}
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
      ? "whitespace-pre-wrap leading-relaxed" // ← solo para el usuario
      : [
          "prose prose-sm sm:prose-base max-w-none leading-relaxed",
          // párrafos normales más compactos
          "[&_p]:my-2 [&_ul]:my-2 [&_ol]:my-2 [&_li]:my-0.5",
          // TÍTULOS en negrita: párrafos que SOLO contienen un <strong>
          "[&_p:has(>strong:only-child)]:mt-4",
          "[&_p:has(>strong:only-child)]:mb-1",
        ].join(" ")
  }
>
  {m.content}
</Markdown>

                    <div className={`mt-1 text-[11px] ${mine ? "text-gray-300" : "text-gray-500"}`}>
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
                disabled={loading || !contextLoaded}
                placeholder={contextLoaded ? "Escribí tu pregunta…" : "Cargando contexto…"}
                className="max-h-[200px] w-full resize-none rounded-xl border px-4 py-3 text-sm text-gray-900 placeholder:text-gray-400 focus:border-gray-900 focus:outline-none disabled:cursor-not-allowed disabled:bg-gray-50"
              />
              <button
                onClick={() => sendMessage()}
                disabled={loading || !contextLoaded || !input.trim()}
                className="inline-flex items-center gap-2 rounded-2xl bg-gray-900 px-5 py-3 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-black disabled:cursor-not-allowed disabled:opacity-50"
              >
                {loading ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
                {loading ? "Enviando" : "Enviar"}
              </button>
            </div>
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
          </a>.
        </p>
      </footer>
      </main>
    </div>
  );
}
