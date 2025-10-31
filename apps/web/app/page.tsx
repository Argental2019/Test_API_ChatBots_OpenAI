"use client";
import React, { useEffect, useMemo, useRef, useState } from "react";
import { Home, Sparkles, Send, Loader2, MessageSquareText } from "lucide-react";

type ChatMessage = { role: "user" | "assistant"; content: string; ts?: number };

const AGENTS = [
  {
    id: "fe960-public",
    slug: "fe960",
    name: "Asesor Horno FE960",
    description: "Especialista en horno rotativo FE 4.0-960 de Argental",
    accent: "from-blue-500 to-cyan-500",
    driveFolders: [
      "17enT9eKi8Wgr92wOhVlqHyIUFlZP1bo4",
      "1fuxxbhU_0__-YtpezDHaSa_6D9C2LEjo",
    ],
    faqs: [
      "¿Qué productos se pueden hacer?",
      "¿Cuáles son las especificaciones técnicas?",
      "¿Cómo es el procedimiento de limpieza?",
      "¿Qué requisitos de instalación tiene?",
    ],
    systemPrompt:
      "Sos el Asesor Público del Horno Rotativo FE 4.0-960 de Argental.\nTu función es asistir con información técnica verificable basada exclusivamente en la documentación oficial.\nNo uses conocimiento general ni internet. Solo respondé con información literal de los documentos.",
  },
];

function time(ts?: number) {
  if (!ts) return "";
  return new Date(ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

export default function MultiAgentChat() {
  const [selectedAgent, setSelectedAgent] = useState<any>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [contextLoaded, setContextLoaded] = useState(false);
  const [contextCache, setContextCache] = useState<string | null>(null);

  const endRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    if (selectedAgent && !contextLoaded) {
      loadContext();
    }
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
    try {
      // Warmup opcional
      await fetch(`${process.env.NEXT_PUBLIC_BACKEND_HEALTH ?? ""}` || "/api/noop").catch(() => {});
      const r = await fetch("/api/context", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ driveFolders: selectedAgent.driveFolders }),
      });
      if (!r.ok) throw new Error(await r.text());
      const data = await r.json();
      setContextCache(data.context || "");
      setContextLoaded(true);
    } catch (e) {
      console.error(e);
      setMessages([
        { role: "assistant", content: "No pude cargar el contexto documental. Intentá nuevamente.", ts: Date.now() },
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
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: [...messages, userMessage],
          systemPrompt: selectedAgent.systemPrompt,
          context: contextCache,
        }),
      });

      if (!response.ok || !response.body) throw new Error("Error en la respuesta");

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let assistantMessage: ChatMessage = { role: "assistant", content: "", ts: Date.now() };
      setMessages((prev) => [...prev, assistantMessage]);

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value);
        const lines = chunk.split("\n").filter((l) => l.trim().startsWith("data: "));
        for (const line of lines) {
          const data = line.replace("data: ", "");
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
          } catch {}
        }
      }
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

  const handleKey = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
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
  };

  const goBack = () => {
    setSelectedAgent(null);
    setMessages([]);
    setContextLoaded(false);
    setContextCache(null);
  };

  // =======================
  // VISTA: SELECCIÓN
  // =======================
  if (!selectedAgent) {
    return (
      <div className="min-h-screen bg-white">
        <div className="mx-auto flex min-h-screen max-w-6xl flex-col px-6">
          {/* Header */}
          <header className="flex items-center justify-between py-6">
            <div className="flex items-center gap-2">
              <div className="size-8 rounded-xl bg-gray-900" />
              <span className="text-lg font-semibold tracking-tight text-gray-900">Argental · Agents</span>
            </div>
            <span className="text-xs text-gray-500">v1</span>
          </header>

          {/* Hero centrado */}
          <main className="grid flex-1 place-items-center">
            <div className="w-full max-w-3xl">
              <h1 className="text-center text-5xl font-extrabold tracking-tight text-gray-900">
                Multi-Agent <span className="text-gray-400">Chat</span>
              </h1>
              <p className="mt-3 text-center text-gray-600">
                Seleccioná un agente para comenzar
              </p>

              <div className="mt-10 grid gap-6 sm:grid-cols-2">
                {AGENTS.map((a) => (
                  <button
                    key={a.id}
                    onClick={() => selectAgent(a)}
                    className="group relative overflow-hidden rounded-2xl border bg-white p-6 text-left shadow-sm transition-all hover:shadow-xl"
                  >
                    <div
                      className={`pointer-events-none absolute inset-0 rounded-2xl bg-gradient-to-br ${a.accent} opacity-0 transition-opacity group-hover:opacity-10`}
                    />
                    <div className="relative">
                      <div className="inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-medium text-gray-600">
                        <MessageSquareText className="size-3.5" />
                        Público
                      </div>
                      <h3 className="mt-3 text-xl font-semibold text-gray-900">{a.name}</h3>
                      <p className="mt-1 text-sm leading-6 text-gray-600">{a.description}</p>

                      <div className="mt-6 inline-flex items-center gap-2 text-sm font-medium text-gray-700">
                        <Sparkles className="size-4" />
                        <span>Iniciar chat</span>
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          </main>

          <footer className="py-8 text-center text-xs text-gray-500">
            © {new Date().getFullYear()} Argental · Asistentes
          </footer>
        </div>
      </div>
    );
  }

  // =======================
  // VISTA: CHAT
  // =======================
  return (
    <div className="min-h-screen bg-white">
      {/* Header sticky centrado */}
      <header className="sticky top-0 z-10 border-b bg-white/80 backdrop-blur">
        <div className="mx-auto flex max-w-4xl items-center justify-between px-6 py-4">
          <button
            onClick={goBack}
            className="inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            <Home className="size-4" />
            Volver
          </button>

          <div className="flex flex-col items-center">
            <h2 className="text-lg font-semibold text-gray-900">{selectedAgent.name}</h2>
            <p className="text-xs text-gray-500">{selectedAgent.description}</p>
          </div>

          <div className="w-[84px]" />
        </div>
      </header>

      <main className="mx-auto max-w-4xl px-6">
        {/* FAQs */}
        {!!selectedAgent.faqs?.length && (
          <div className="mt-6 flex flex-wrap justify-center gap-2">
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

        {/* Contenedor de chat */}
        <section className="mt-6 rounded-2xl border bg-white shadow-sm">
          {/* Mensajes */}
          <div className="max-h-[65vh] overflow-y-auto p-4 sm:p-6">
            {!contextLoaded && (
              <div className="space-y-4">
                <div className="flex items-center justify-center gap-3 text-gray-700">
                  <Loader2 className="size-5 animate-spin" />
                  <span>Cargando documentación…</span>
                </div>
                {/* Skeletons */}
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
                    <div className="whitespace-pre-wrap">{m.content}</div>
                    <div className={`mt-1 text-[11px] ${mine ? "text-gray-300" : "text-gray-500"}`}>
                      {mine ? "Vos" : selectedAgent.name} · {time(m.ts)}
                    </div>
                  </div>
                </div>
              );
            })}
            <div ref={endRef} />
          </div>

          {/* Composer sticky */}
          <div className="sticky bottom-0 border-t bg-white p-3 sm:p-4">
            <div className="flex items-end gap-3">
              <textarea
                ref={inputRef}
                rows={1}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKey}
                disabled={loading || !contextLoaded}
                placeholder={contextLoaded ? "Escribí tu pregunta…" : "Cargando contexto…"}
                className="max-h-[200px] w-full resize-none rounded-xl border px-4 py-3 text-sm text-gray-900 placeholder:text-gray-400 focus:border-gray-900 focus:outline-none disabled:cursor-not-allowed disabled:bg-gray-50"
              />
              <button
                onClick={sendMessage}
                disabled={loading || !contextLoaded || !input.trim()}
                className="inline-flex items-center gap-2 rounded-xl bg-gray-900 px-5 py-3 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-black disabled:cursor-not-allowed disabled:opacity-50"
              >
                {loading ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
                {loading ? "Enviando" : "Enviar"}
              </button>
            </div>
          </div>
        </section>

        <footer className="py-8 text-center text-xs text-gray-500">© {new Date().getFullYear()} Argental · Asistentes</footer>
      </main>
    </div>
  );
}
