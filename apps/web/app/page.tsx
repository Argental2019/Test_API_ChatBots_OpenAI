"use client";
import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  Home,
  Sparkles,
  Send,
  Loader2,
  CheckCircle2,
  AlertCircle,
  MessageSquareText,
} from "lucide-react";

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
      "¿Por qué debería comprar este equipo?",
      "¿Qué productos puede hacer y con qué nivel de producción?",
      "¿Es un equipo seguro?",
      "¿La cocción es pareja y eficiente?",
    ],
    systemPrompt:
       `
# 🧠 Instrucciones del Agente: Asesor Público Horno rotativo FE 4.0-960

### 🎯 Rol del agente
Sos **Asesor Público Horno Rotativo FE 4.0-960**, un agente especializado **exclusivamente** en el horno rotativo FE 4.0-960 de panadería industrial fabricado por **Argental**.
Tu única función es asistir a usuarios externos brindando **respuestas claras, técnicas y verificables**, basadas **solo** en la documentación oficial de Argental almacenada en Google Drive.
🔒 **No usás conocimiento general, memoria previa ni internet.** Solo respondés con información literal, comprobable y actualizada desde los documentos cargados por la API.

---

## ⚙️ Flujo operativo del agente
⚙️ Configuración (estricta, en cada pregunta)

Antes de redactar cualquier respuesta, EJECUTÁ este pre-check si o si:

1) Llamá a POST /drive/checkChanges con el manifest actual que tengas en memoria.
   - Si no tenés manifest en memoria, pasá un objeto vacío: {}.

2) Si la respuesta trae hasChanges = true:
   a) Llamá a POST /cache/invalidate con el arreglo "changed" + "removed" (IDs).
   b) Llamá a POST /drive/bulkRead con "changed" + "added" (IDs).
   c) Reemplazá tu manifest en memoria por el manifest devuelto en checkChanges.manifestNew.
   d) Reemplazá tu snapshot local de textos por el JSON devuelto en bulkRead.

3) Si hasChanges = false:
   - No re-leas; usá tu snapshot local.

4) Recién ahora, respondé usando EXCLUSIVAMENTE lo que tengas en tu snapshot local.

Notas importantes:
- Incluí siempre un header X-Session-Id único por chat/sesión.
- Si el usuario envía ?nocache=true en la URL del backend, asumí que todo debe re-leerse (forzá invalidateAll + bulkReadAll).
- Nunca uses conocimiento general ni internet.

## 🧾 Registro de preguntas sin respaldo
Si no existe evidencia documental para responder:

POST /agent/log-miss
{
  "question": "<pregunta del usuario>",
  "agentId": "fe960-public",
  "userId": "anon",
  "folderId": "<folder autorizado>",
  "notes": "sin evidencia en documentación",
  "context": "tema resumido (p. ej. instalación, mantenimiento, capacidad)"
}

Esto asegura trazabilidad de consultas no cubiertas por la documentación.

---

## 📂 Fuentes de información
Usá **solo** los archivos ubicados en las carpetas:
* "Info pública"
* "Info pública general"

Si alguno no se puede leer o está incompleto, continuá con los demás sin mencionarlo.

### 📘 Glosario técnico
El documento “Glosario de términos.docx” (en "Info pública general") define los términos válidos.
Si un término no aparece allí, pedí al usuario una breve aclaración antes de responder.

---

## 🔍 Protocolo de lectura y consistencia
* **Lectura completa:** leé todos los archivos del folder sin filtrar por relevancia.
* **Actualización automática:** verificá los etag del manifest antes de cada sesión.
* **Prioridad:** si hay duplicados, usá la versión más reciente.
* **Integración:** si hay diferencias entre documentos, integrá la información coherentemente sin mencionarlo.

---

## 🚫 Restricciones absolutas
* No usar internet ni fuentes externas.
* No inferir ni inventar información.
* No mostrar nombres de archivos, IDs o rutas.
* No copiar textualmente párrafos largos.
* No conservar contexto de conversaciones previas.

---

## 🗣️ Estilo de respuesta
* Profesional, técnico y directo.
* No incluyas advertencias, disculpas ni comentarios de sistema.
* Redactá respuestas completas, claras y verificables.

✅ Ejemplo de estilo:
> El horno rotativo Argental FE 4.0-960 permite la cocción de productos de panadería, bollería y pastelería.
> Su capacidad máxima es de hasta 300 kg por carga, según el tipo de bandeja.
> Opera entre 110 °C y 300 °C con control térmico por etapas y sistema de vaporización por cascada.

---

## 🧩 Resumen operativo (checklist rápido)
✅ Verificá cambios con /drive/checkChanges  
✅ Si cambió algo → invalidá, recargá y actualizá manifest  
✅ Leé todo el folder con /drive/smartRead si es necesario  
✅ Respondé solo con información literal y consolidada  
✅ Registrá misses en /agent/log-miss
---
## Modo sin evidencia (obligatorio)
Si **no existe evidencia literal** en los documentos para responder la pregunta, devolvé **una única línea** con este formato y **nada más**:

@@MISS{"agentId":"fe960-public","userId":"anon","folderId":"Info pública","notes":"sin evidencia en documentación","context":"<tema resumido>","question":"<pregunta del usuario>"}

    `
  },
];

function formatTime(ts?: number) {
  if (!ts) return "";
  const d = new Date(ts);
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

export default function MultiAgentChat() {
  const [selectedAgent, setSelectedAgent] = useState<any>(null);
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
    setToast(null);
    try {
      // “wake up” opcional
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
    setToast(null);
  };

  const goBack = () => {
    setSelectedAgent(null);
    setMessages([]);
    setContextLoaded(false);
    setContextCache(null);
    setToast(null);
  };

  // ---------- VISTA: LISTA DE AGENTES ----------
  if (!selectedAgent) {
    return (
      <div className="min-h-screen bg-white">
        <header className="border-b bg-white/70 backdrop-blur">
          <div className="mx-auto max-w-6xl px-4 py-4 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="size-8 rounded-lg bg-gradient-to-tr from-gray-900 to-gray-700" />
              <span className="text-lg font-semibold tracking-tight text-gray-900">Argental · Agents</span>
            </div>
            <div className="text-xs text-gray-500">v1</div>
          </div>
        </header>

        <main className="mx-auto max-w-6xl px-4 py-12">
          <div className="mb-10">
            <h1 className="text-4xl font-bold tracking-tight text-gray-900">Multi-Agent Chat</h1>
            <p className="mt-2 text-gray-600">Seleccioná un agente para comenzar</p>
          </div>

          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {AGENTS.map((agent) => (
              <button
                key={agent.id}
                onClick={() => selectAgent(agent)}
                className="group relative overflow-hidden rounded-2xl border bg-white p-6 text-left shadow-sm transition-all hover:shadow-xl"
              >
                <div
                  className={`pointer-events-none absolute inset-0 bg-gradient-to-br ${agent.accent} opacity-0 transition-opacity group-hover:opacity-10`}
                />
                <div className="relative">
                  <div className="inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-medium text-gray-600">
                    <MessageSquareText className="size-3.5" />
                    Público
                  </div>
                  <h3 className="mt-3 text-xl font-semibold text-gray-900">{agent.name}</h3>
                  <p className="mt-1 text-sm leading-6 text-gray-600">{agent.description}</p>

                  <div className="mt-6 inline-flex items-center gap-2 text-sm font-medium text-gray-700">
                    <Sparkles className="size-4" />
                    <span>Iniciar chat</span>
                  </div>
                </div>
              </button>
            ))}
          </div>
        </main>
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

      <main className="mx-auto max-w-4xl px-4">
        {/* Toast */}
        {toast && (
          <div
            className={`mt-4 flex items-center gap-2 rounded-xl border px-4 py-3 text-sm ${
              toast.type === "ok" ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-rose-200 bg-rose-50 text-rose-700"
            }`}
          >
            {toast.type === "ok" ? <CheckCircle2 className="size-4" /> : <AlertCircle className="size-4" />}
            {toast.msg}
          </div>
        )}

        {/* FAQs */}
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

        {/* Chat */}
        <section className="mt-6 rounded-2xl border bg-white shadow-sm">
          <div className="max-h-[64vh] overflow-y-auto p-4 sm:p-6">
            {!contextLoaded && (
              <div className="space-y-4">
                <div className="flex items-center gap-3 text-gray-700">
                  <Loader2 className="size-5 animate-spin" />
                  <span>Cargando documentación…</span>
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
                      mine
                        ? "bg-gray-900 text-white shadow-md"
                        : "border bg-white text-gray-900 shadow-sm"
                    }`}
                  >
                    <div className="whitespace-pre-wrap">{m.content}</div>
                    <div className={`mt-1 text-[11px] ${mine ? "text-gray-300" : "text-gray-500"}`}>
                      {mine ? "Vos" : selectedAgent.name} · {formatTime(m.ts)}
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

        <footer className="mx-auto max-w-4xl py-8 text-center text-xs text-gray-500">
          © {new Date().getFullYear()} Argental · Asistentes
        
        </footer>
      </main>
    </div>
  );
}
