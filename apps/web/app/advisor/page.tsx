// apps/web/app/advisor/page.tsx
"use client";

import React, { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Home, Send, Loader2 } from "lucide-react";
import Markdown from "@/components/markdown";
import { getAgentsByIds } from "@/lib/advisorTools";

type ChatMessage = {
  role: "user" | "assistant";
  content: string;
  ts?: number;
  recommendedAgents?: Array<{ id: string; name: string; url: string; family: string }>;
};

function formatTime(ts?: number) {
  if (!ts) return "";
  return new Date(ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function parseRecommendations(text: string): { clean: string; ids: string[] } {
  const ids: string[] = [];
  const clean = text.replace(/\[RECOMENDAR:([^\]]+)\]/g, (_, id) => {
    ids.push(id.trim());
    return "";
  }).trim();
  return { clean, ids };
}

export default function AdvisorPage() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);

  const endRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = "0px";
    el.style.height = Math.min(el.scrollHeight, 200) + "px";
  }, [input]);

  const sendMessage = async (text?: string) => {
    const content = (text ?? input).trim();
    if (!content || loading) return;

    const userMessage: ChatMessage = { role: "user", content, ts: Date.now() };
    const history = [...messages, userMessage];

    setMessages(history);
    setInput("");
    setLoading(true);

    try {
      const response = await fetch("/api/advisor", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "text/event-stream",
        },
        body: JSON.stringify({
          messages: history.map((m) => ({ role: m.role, content: m.content })),
        }),
      });

      if (!response.ok || !response.body) throw new Error("Error en la respuesta");

      const reader = response.body.getReader();
      const decoder = new TextDecoder("utf-8");

      let assistantMessage: ChatMessage = { role: "assistant", content: "", ts: Date.now() };
      setMessages((prev) => [...prev, assistantMessage]);

      let raw = "";
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
            if (!delta) continue;
            raw += delta;

            const { clean } = parseRecommendations(raw);
            assistantMessage.content = clean;

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

      // Al terminar el stream, extraer los equipos recomendados
      const { clean, ids } = parseRecommendations(raw);
      const recommendedAgents = ids.length > 0 ? getAgentsByIds(ids) : [];

      const finalMessage: ChatMessage = {
        role: "assistant",
        content: clean,
        ts: assistantMessage.ts,
        recommendedAgents,
      };

      setMessages((prev) => {
        const nm = [...prev];
        nm[nm.length - 1] = finalMessage;
        return nm;
      });

    } catch (error) {
      console.error(error);
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: "El servicio está procesando muchas consultas en este momento. Probá de nuevo en unos segundos.",
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

  const FAQS = [
    "¿Qué equipos necesito para producir 500 kg de pan por día?",
    "Quiero poner una panadería industrial desde cero",
    "Necesito hacer medialunas a escala industrial",
    "¿Qué horno me recomendás para pan francés?",
    "Quiero automatizar mi línea de producción",
  ];

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
              Activo
            </div>
            <h2 className="mt-2 text-base font-semibold text-gray-900">Busquetti — Asesor Integral</h2>
            <p className="text-xs text-gray-500">Contame qué necesitás y te recomiendo los equipos ideales</p>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-4xl px-4">
        {/* FAQs */}
        <div className="mt-6 flex flex-wrap gap-2">
          {FAQS.map((faq, i) => (
            <button
              key={i}
              onClick={() => sendMessage(faq)}
              disabled={loading}
              className="rounded-full border bg-white px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {faq}
            </button>
          ))}
        </div>

        {/* Chat */}
        <section className="mt-6 rounded-2xl border bg-white shadow-sm">
          <div className="max-h-[64vh] overflow-y-auto p-4 sm:p-6">

            {messages.length === 0 && (
              <div className="flex flex-col items-center justify-center py-12 text-center text-gray-400">
                <div className="mb-4 size-16 rounded-full overflow-hidden border border-gray-200 shadow-sm">
                  <img
                    src="/busquetti/LogoBusquetti.jpg"
                    alt="Busquetti"
                    className="w-full h-full object-cover object-[center_12%] scale-[1.8]"
                  />
                </div>
                <p className="text-sm font-medium text-gray-600">Hola, soy Busquetti</p>
                <p className="mt-1 text-xs text-gray-400">
                  Contame qué querés producir y te ayudo a elegir los equipos que necesitás
                </p>
              </div>
            )}

            {messages.map((m, i) => {
              const mine = m.role === "user";
              return (
                <div
                  key={i}
                  className={`mb-3 flex items-end gap-2 ${mine ? "justify-end" : "justify-start"}`}
                >
                  {!mine && (
                    <div className="shrink-0 size-10 rounded-full overflow-hidden border border-gray-200 shadow-sm bg-white">
                      <img
                        src="/busquetti/LogoBusquetti.jpg"
                        alt="Busquetti"
                        className="w-full h-full object-cover object-[center_12%] scale-[1.8]"
                      />
                    </div>
                  )}

                  <div className={`w-fit max-w-[85%] ${mine ? "" : "space-y-3"}`}>
                    <div
                      className={`rounded-2xl px-5 py-3 text-sm leading-6 ${
                        mine
                          ? "bg-gray-900 text-white shadow-md"
                          : "border bg-white text-gray-900 shadow-sm"
                      }`}
                    >
                      <Markdown
                        className={
                          mine
                            ? "whitespace-pre-wrap leading-relaxed"
                            : "prose prose-sm sm:prose-base max-w-none leading-relaxed [&_p]:my-2 [&_ul]:my-2 [&_ol]:my-2 [&_li]:my-0.5"
                        }
                      >
                        {m.content}
                      </Markdown>
                      <div className={`mt-1 text-[11px] ${mine ? "text-gray-300" : "text-gray-500"}`}>
                        {mine ? "Vos" : "Busquetti"} · {formatTime(m.ts)}
                      </div>
                    </div>

                    {/* Tarjetas de equipos recomendados */}
                    {!mine && m.recommendedAgents && m.recommendedAgents.length > 0 && (
                      <div className="mt-3 space-y-2">
                        <p className="text-xs font-semibold text-gray-500 px-1">Equipos recomendados:</p>
                        {m.recommendedAgents.map((agent) => (
                          <div
                            key={agent.id}
                            className="flex items-center justify-between gap-3 rounded-xl border bg-white px-4 py-3 shadow-sm"
                          >
                            <div>
                              <p className="text-sm font-semibold text-gray-900">{agent.name}</p>
                              <p className="text-xs text-gray-500">{agent.family}</p>
                            </div>
                            <Link
                              href={agent.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="shrink-0 inline-flex items-center gap-1 rounded-lg bg-gray-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-black transition"
                            >
                              Ver ficha ↗
                            </Link>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {mine && (
                    <div className="shrink-0 size-8 rounded-full bg-gray-900 flex items-center justify-center shadow-sm">
                      <span className="text-white text-xs font-semibold">Vos</span>
                    </div>
                  )}
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
                disabled={loading}
                placeholder="Contame qué necesitás producir…"
                className="max-h-[200px] flex-1 resize-none rounded-xl border px-4 py-3 text-sm text-gray-900 placeholder:text-gray-400 focus:border-gray-900 focus:outline-none disabled:cursor-not-allowed disabled:bg-gray-50"
              />
              <button
                onClick={() => sendMessage()}
                disabled={loading || !input.trim()}
                className="inline-flex items-center gap-2 rounded-2xl bg-gray-900 px-5 py-3 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-black disabled:cursor-not-allowed disabled:opacity-50"
              >
                {loading ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
                {loading ? "Enviando" : "Enviar"}
              </button>
            </div>
          </div>
        </section>

        <footer className="py-6 mt-6 border-t text-center text-xs text-gray-500">
          <p>© {new Date().getFullYear()} Argental · Busquetti Asesor Integral</p>
        </footer>
      </main>
    </div>
  );
}