"use client";
import React, { useEffect, useRef, useState } from "react";
import { MessageCircle, Send, Loader2, Home, Sparkles } from "lucide-react";

const AGENTS = [
  {
    id: "fe960-public",
    slug: "fe960",
    name: "Asesor Horno FE960",
    description: "Especialista en horno rotativo FE 4.0-960 de Argental",
    color: "from-blue-500 to-cyan-500",
    driveFolders: ["17enT9eKi8Wgr92wOhVlqHyIUFlZP1bo4", "1fuxxbhU_0__-YtpezDHaSa_6D9C2LEjo"],
    faqs: [
      "¿Qué productos se pueden hacer?",
      "¿Cuáles son las especificaciones técnicas?",
      "¿Cómo es el procedimiento de limpieza?",
      "¿Qué requisitos de instalación tiene?"
    ],
    systemPrompt:
      "Sos el Asesor Público del Horno Rotativo FE 4.0-960 de Argental.\nTu función es asistir con información técnica verificable basada exclusivamente en la documentación oficial.\nNo uses conocimiento general ni internet. Solo respondé con información literal de los documentos."
  }
];

export default function MultiAgentChat() {
  const [selectedAgent, setSelectedAgent] = useState<any>(null);
  const [messages, setMessages] = useState<any[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [contextLoaded, setContextLoaded] = useState(false);
  const [contextCache, setContextCache] = useState<string | null>(null);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    if (selectedAgent && !contextLoaded) {
      loadContext();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedAgent]);

  const loadContext = async () => {
    if (!selectedAgent?.driveFolders) return;
    setLoading(true);
    try {
      const r = await fetch("/api/context", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ driveFolders: selectedAgent.driveFolders })
      });
      if (!r.ok) throw new Error(await r.text());
      const data = await r.json();
      setContextCache(data.context || "");
      setContextLoaded(true);
    } catch (e) {
      console.error(e);
      setMessages([{ role: "assistant", content: "No pude cargar el contexto documental. Intentá nuevamente." }]);
    } finally {
      setLoading(false);
    }

await fetch(`${process.env.NEXT_PUBLIC_BACKEND_HEALTH ?? ""}` || "/api/noop")
  .catch(() => {});

  };

  const sendMessage = async () => {
    if (!input.trim() || loading || !contextLoaded) return;

    const userMessage = { role: "user", content: input };
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
          context: contextCache
        })
      });

      if (!response.ok || !response.body) throw new Error("Error en la respuesta");

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let assistantMessage = { role: "assistant", content: "" };
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
        { role: "assistant", content: "Error generando respuesta. Verificá la configuración del servidor." }
      ]);
    } finally {
      setLoading(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent<HTMLInputElement>) => {
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

  if (!selectedAgent) {
    return (
      <div className="min-h-screen bg-white">
        <div className="container mx-auto px-4 py-12 max-w-6xl">
          <div className="text-center mb-12">
            <h1 className="text-5xl font-bold text-gray-900 mb-4">Multi-Agent Chat</h1>
            <p className="text-gray-600 text-lg">Seleccioná un agente para comenzar</p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {AGENTS.map((agent) => (
              <button
                key={agent.id}
                onClick={() => selectAgent(agent)}
                className="group relative bg-white rounded-2xl p-6 border-2 border-gray-200 hover:border-blue-500 transition-all hover:shadow-xl"
              >
                <div className={`absolute inset-0 bg-gradient-to-br ${agent.color} opacity-0 group-hover:opacity-10 rounded-2xl transition-opacity`} />
                <div className="relative">
                  <h3 className="text-2xl font-bold text-gray-900 mb-2">{agent.name}</h3>
                  <p className="text-gray-600 text-sm">{agent.description}</p>
                </div>
                <div className="mt-4 flex items-center justify-center text-gray-500 group-hover:text-blue-600 transition-colors">
                  <Sparkles className="w-4 h-4 mr-2" />
                  <span className="text-sm">Iniciar chat</span>
                </div>
              </button>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <div className="bg-white border-b border-gray-200 shadow-sm">
        <div className="container mx-auto px-4 py-4 max-w-4xl">
          <div className="flex items-center justify-between">
            <button onClick={goBack} className="flex items-center text-gray-700 hover:text-gray-900 transition-colors">
              <Home className="w-5 h-5 mr-2" />
              <span>Volver</span>
            </button>
            <div className="text-center flex-1">
              <h2 className="text-2xl font-bold text-gray-900">{selectedAgent.name}</h2>
              <p className="text-gray-600 text-sm">{selectedAgent.description}</p>
            </div>
            <div className="w-24" />
          </div>
        </div>
      </div>

      {selectedAgent.faqs && (
        <div className="bg-white border-b border-gray-200">
          <div className="container mx-auto px-4 py-3 max-w-4xl">
            <div className="flex flex-wrap gap-2">
              {selectedAgent.faqs.map((faq: string, i: number) => (
                <button
                  key={i}
                  onClick={() => setInput(faq)}
                  disabled={loading || !contextLoaded}
                  className="px-3 py-1.5 text-sm bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed border border-gray-300"
                >
                  {faq}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      <div className="flex-1 overflow-y-auto bg-gray-50">
        <div className="container mx-auto px-4 py-6 max-w-4xl space-y-4">
          {!contextLoaded && (
            <div className="flex items-center justify-center py-12">
              <div className="text-center">
                <Loader2 className="w-12 h-12 text-blue-500 animate-spin mx-auto mb-4" />
                <p className="text-gray-700 text-lg">Cargando documentación...</p>
              </div>
            </div>
          )}

          {messages.map((msg, i) => (
            <div key={i} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
              <div
                className={`max-w-3xl rounded-2xl px-6 py-4 ${
                  msg.role === "user"
                    ? "bg-blue-500 text-white shadow-md"
                    : "bg-white text-gray-900 shadow-md border border-gray-200"
                }`}
              >
                <div className={`text-xs mb-2 uppercase font-semibold ${msg.role === "user" ? "text-blue-100" : "text-gray-500"}`}>
                  {msg.role === "user" ? "Vos" : selectedAgent.name}
                </div>
                <div className="whitespace-pre-wrap">{msg.content}</div>
              </div>
            </div>
          ))}
          <div ref={endRef} />
        </div>
      </div>

      <div className="bg-white border-t border-gray-200 shadow-lg">
        <div className="container mx-auto px-4 py-4 max-w-4xl">
          <div className="flex gap-3">
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyPress}
              disabled={loading || !contextLoaded}
              placeholder={contextLoaded ? "Escribí tu pregunta..." : "Cargando contexto..."}
              className="flex-1 px-6 py-4 bg-white border-2 border-gray-300 rounded-xl text-gray-900 placeholder-gray-400 focus:outline-none focus:border-blue-500 disabled:opacity-50 disabled:bg-gray-50"
            />
            <button
              onClick={sendMessage}
              disabled={loading || !contextLoaded || !input.trim()}
              className="px-8 py-4 bg-blue-500 text-white rounded-xl font-semibold hover:bg-blue-600 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 shadow-md"
            >
              {loading ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  <span>Enviando...</span>
                </>
              ) : (
                <>
                  <Send className="w-5 h-5" />
                  <span>Enviar</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
