// apps/web/app/advisor/page.tsx
"use client";

import React, { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Home, Send, Loader2, AudioLines } from "lucide-react";
import Markdown from "@/components/markdown";
import { getAgentsByIds, getCatalogAsText } from "@/lib/advisorTools";
import { useElevenLabsVoice } from "@/hooks/useElevenLabsVoice";
import type { VoiceMessage } from "@/hooks/useElevenLabsVoice";
import VoiceModeModal from "@/components/VoiceModeModal";

type ChatMessage = {
  role: "user" | "assistant";
  content: string;
  ts?: number;
  recommendedAgents?: Array<{ id: string; name: string; url: string; family: string; image?: string }>;
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
  const [voiceModalOpen, setVoiceModalOpen] = useState(false);

  const endRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

const advisorVoicePrompt = `INSTRUCCIÓN CRÍTICA — FORMATO DE RESPUESTA:
Cada mensaje tuyo debe contener EXACTAMENTE UNA pregunta y nada más.
NO des explicaciones, NO recomiendes equipos todavía, NO des contexto antes de tener toda la información.
Solo preguntá. Una pregunta. Punto.

Sos Busquetti, el asesor integral de Argental, empresa argentina fabricante de maquinaria para panadería industrial.

Tu rol es entender la necesidad del cliente y recomendarle los equipos correctos. Respondé siempre en español, con tono profesional y cercano. Sé conciso — máximo 2 oraciones por respuesta.

IMPORTANTE: Solo podés recomendar equipos que estén en el siguiente catálogo. NUNCA inventes modelos que no existan en esta lista.

CATÁLOGO DE EQUIPOS DISPONIBLES:
${getCatalogAsText()}

PROCESO DE DIAGNÓSTICO OBLIGATORIO — seguí este orden sin saltear pasos:

PASO 1 — Entender qué produce:
Preguntá qué tipo de productos va a fabricar si no lo dijo. (pan francés, medialunas, pan de molde, facturas, pizzas, empanadas, etc.)

PASO 2 — Entender el volumen:
Preguntá cuántos kg por turno o por día necesita producir.

PASO 3 — Equipos existentes:
Preguntá si ya tiene algún equipo o arranca desde cero. Si ya tiene equipos, preguntá cuáles.

PASO 4 — Energía disponible:
Preguntá qué tipo de energía tiene disponible (gas natural, eléctrico monofásico, trifásico).

PASO 5 — Línea completa:
Según el producto que fabrica, preguntá si necesita cubrir todas las etapas del proceso:
- Para pan francés: ¿necesita amasadora, divisora, cámara de fermentación, horno, trinchadora?
- Para medialunas: ¿necesita amasadora, laminadora, cortadora/armadora, cámara de fermentación, horno?
- Para pan de molde: ¿necesita amasadora, divisora, moldes, horno, rebanadora?
- Para facturas: ¿necesita amasadora, laminadora, cortadora, horno?
- Para pizzas: ¿necesita amasadora, formadora de pizzas, horno?

PASO 6 — Recomendar:
Solo después de completar los pasos anteriores, recomendá los equipos del catálogo que correspondan a cada etapa del proceso. Recomendá siempre la línea completa, no solo un equipo aislado.

REGLA IMPORTANTE: No recomiendes equipos hasta haber completado al menos los pasos 1, 2, 3 y 4. Si el cliente da mucha información de golpe, igual confirmá energía y equipos existentes antes de recomendar.

REGLA DE PREGUNTAS — OBLIGATORIA:
- Hacé EXACTAMENTE UNA pregunta por mensaje.
- PROHIBIDO hacer dos preguntas en el mismo mensaje aunque estén relacionadas.
- PROHIBIDO usar "y" para unir dos preguntas.
- Si tenés ganas de preguntar dos cosas, elegí la más importante y guardá la otra para después.
- Esperá siempre la respuesta antes de hacer la siguiente pregunta.
- Ejemplo PROHIBIDO: "¿Cuántos kilos producís y tenés equipos?"
- Ejemplo CORRECTO: "¿Cuántos kilos de pan francés querés producir por día?"
- Si en un mensaje anterior hiciste dos preguntas y el cliente solo respondió una, retomá la pregunta sin responder antes de continuar.

Cuando menciones un producto, usá ÚNICAMENTE su pronunciación oficial:
- FE960 / FE4.0-960 → "Horno Argental For Export nueve sesenta cuatro punto cero"
- GALILEO → "Sistema Argental Galileo pan francés y molde"
- MBE-80U-S → "Amasadora Argental eme be e ochenta"
- MBE-200U-S → "Amasadora Argental eme be e doscientos"
- PA340 → "Horno Panier cuarenta y cinco setenta"
- C4000 → "Medialunera Ambro ce cuatro mil"
- M-6130/17 → "Laminadora Ambro eme seiscientos"
- TORNADO PL → "Mesa de Corte Ambro Tornado Plus E"
- BLIND LI FULL → "Sobadora Argental Blind"
- GALILEO ARTESAN → "Sistema Argental Galileo Artesano"
- COMPRESSLINE → "Mesa Ambro Compressline"
- LINEA CIABATTA → "Línea Ciabattera Ambro"
- FOGLIA → "Laminadora automática Ambro Foglia"
- TORNADO PL II → "Mesa de Corte Ambro Tornado Plus E dos"
- GT-38 → "Grupo Trinchador Argental ge te treinta y ocho"
- FE III-315 → "Horno Argental For Export tres quince"
- 360 BE → "Sobadora automática Argental tres sesenta be e"
- CORBOLI → "Cortadora bollera Argental Córboli"
- MBE-160HA → "Amasadora Argental ciento sesenta hache a"
- DB / DB1000 → "Divisora volumétrica Argental de be mil"
- FE4.0-472 → "Horno Argental For Export cuatro siete dos cuatro punto cero"
- FE BIO 472 → "Horno Argental For Export bío cuatro siete dos cuatro punto cero"
- FE BIO 960 → "Horno Argental For Export bío nueve sesenta cuatro punto cero"
- ARM-4000 → "Cabezal armador Ambro cuatro mil"
- RAPIFREDDO-T5 → "Tunel ultracongelador Argental Rapifredo te quince"
- GTC MODULAR → "Grupo trinchador Argental ge te ce"
- H2C → "Horno Argental hache dos ce"
- DBS → "Divisora bollera Panier de be ese treinta cien"
- CFA → "Cámara de fermentación Argental ce efe a"
- EU2C MODULAR → "Cortadora y Armadora Argental e u dos ce"
- ELEVA → "Elevador de bateas Argental"
- MBE-40T → "Amasadora Argental eme be e cuarenta te"
- SGAU MODULAR → "Grupo trinchador automático Argental ese gau"
- HORECA → "Horno rápido Jondal horeca be ele"
- NATO → "Horno convector Panier nato"
- MINICONV → "Horno convector Panier miniconv"
- DOS-AR → "Dosificador de agua Argental dos ar"
- PA390 → "Horno Panier tres setenta noventa"
- RAPIFREDDO-15 → "Abatidor Argental Rapifredo ve quince"
- HCI-500 → "Enfriador de Agua Argental hache ce i quinientos"
- DBSA → "Divisora Bollera Ambro de be ese a cuarenta ciento treinta y cinco"
- A-60 → "Batidora Ambro a sesenta"
- CFC 40B → "Cámara de Fermentación Controlada Panier cuarenta be"
- DB4B → "Divisora Volumétrica Argental cuatro bocas"
- DB2B → "Divisora Volumétrica Argental dos bocas"
- BPNS-20L → "Batidora Panier veinte litros"
- GP-70I → "Grissinera Panchera Argental ge pe setenta"
- RAPIFREDDO-30 → "Tunel ultracongelador Argental Rapifredo te treinta"
- BRISEELINE → "Depositadora Ambro Briseeline"
- GT MINI → "Grupo trinchador Argental ge te mini"
- GT PANIER → "Grupo trinchador ge te Panier"
- BPNS-40L → "Batidora Panier cuarenta litros"
- DOSIF RELLENO → "Dosificador Ambro"
- A-160 → "Batidora Ambro a ciento sesenta"
- MINI-LINEA-COORD → "Mini línea Ambro con estibador coordinado"
- MINI-LINEA-RETRAC → "Mini línea Ambro con estibador retractil"
- C12000 → "Medialunera Ambro ce doce mil"
- ARTESAN → "Divisora Argental de masas hidratadas Artesan"
- CHOPRA III → "Dosificadora Cortadora Ambro Chopra tres"
- LINEA PIZZAS → "Línea de pizza Ambro dos punto cero"
- LINEA EMPANADAS → "Línea empanadas Ambro compac"
- M-66 → "Cortadora Argental eme sesenta y seis"
- LPN-520S → "Laminadora Panier de mesa"
- LIDO → "Horno Argental Lido nueve sesenta"
- SPNI-500 → "Sobadora Panier pastelera"
- BC1200I → "Bollera cónica Argental"
- ARD6I MOD → "Armadora Argental a erre de seis"
- FDPM → "Formadora de Pizzas Argental efe de pe"
- DB1200 → "Divisora volumétrica Argental de be mil doscientos"
- TRANSP BARRAS → "Transportador de Barras Argental"
- INSIGNIA → "Sistema de Panificación Argental Insignia"
- AMBRO PRESS → "Prensa Grasa Ambro"
- RPNM → "Rebanadora de mesa Panier"
- FMI-10 → "Formadora de masa Panier efe eme i diez"
- BPNV-300 → "Depositadora Panier Bizcomatica"
- MP-1I → "Molino Rallador Panier"
- DPN-2232 → "Descortezadora pan de miga Panier"
- MIX-60 → "Batidora Argental mix sesenta"
- BHC → "Bollera horizontal Argental"
- M-6130/17CORTE → "Laminadora Ambro con estación de corte"
- DOSIF-X5 → "Dosificadora múltiple Ambro"
- CFC Vision 40B → "Cámara de Fermentación controlada Argental vision"
- TSI → "Horno Combinado Jondal te ese i"
- Venecia → "Horno Rápido Jondal venecia"
- Horeca XL → "Horno rápido Jondal horeca equis ele"
- MT MODULAR → "Mesa modular Ambro"
- PORTO-20 → "Amasadora Panier Porto veinte"
- PORTO-40 → "Amasadora Panier Porto cuarenta"
- PORTO-80 → "Amasadora Panier Porto ochenta"
- LPN-600 → "Laminadora Panier seiscientos"
- RA12-PACK → "Rebanadora Argental ra doce pack"
- ESCAMA-1.0 → "Escamadora de hielo Argental"
- DBT40-140 → "Divisora bollera Argental de be te"
- FORZA 240 → "Amasadora Argental forza dos cuarenta"
- H3C3.7 → "Horno Argental hache tres ce"
- SPN-600 → "Sobadora Panier ese pe ene seiscientos"
- RAPIFREDDO-V15.2 → "Abatidor Argental Rapifredo ve quince punto dos"

CONTACTO OBLIGATORIO:
Si el usuario pregunta por contacto, compra, posventa o WhatsApp, respondé: "Contactanos por WhatsApp al más cinco cuatro nueve tres cuatro uno cinco cuatro siete cero siete tres siete."

CIERRE — REGLA CRÍTICA:
Si el usuario dice "gracias", "listo", "chau", "bueno" o cualquier señal de que terminó, tu respuesta DEBE ser ÚNICAMENTE esta frase, sin agregar nada más:
"En el chat te dejo los links a cada producto que te recomendé, para que puedas consultarle al especialista de cada equipo y ver todos los detalles. ¡Hasta luego!"
PROHIBIDO responder con otra cosa cuando el usuario se despide.

FORMATO:
- Nunca hagas preguntas al final de tu respuesta si ya recomendaste algo.
- Máximo 2 oraciones por respuesta.`.trim();

const {
  state: voiceState,
  messages: voiceMessages,
  error: voiceError,
  startVoiceMode,
  stopVoiceMode,
} = useElevenLabsVoice({
  systemPrompt: advisorVoicePrompt,
  isAdvisor: true,
});

  const handleOpenVoice = () => {
    setVoiceModalOpen(true);
    startVoiceMode();
  };

 const handleCloseVoice = async () => {
  stopVoiceMode();
  setVoiceModalOpen(false);

  if (voiceMessages.length === 0) return;

  // Volcar mensajes de voz al chat
  const converted: ChatMessage[] = voiceMessages.map((m) => ({
    role: m.role,
    content: m.content,
    ts: m.ts,
  }));
  setMessages((prev) => [...prev, ...converted]);

  // Pedir al orquestador que identifique los equipos recomendados
  try {
    const transcription = voiceMessages
      .map((m) => `${m.role === "user" ? "Cliente" : "Busquetti"}: ${m.content}`)
      .join("\n");

    const response = await fetch("/api/advisor", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        messages: [
          ...voiceMessages.map((m) => ({ role: m.role, content: m.content })),
          {
            role: "user",
        content: `Basándote en esta conversación, identificá el perfil del cliente (qué produce, cuánto volumen, qué energía tiene, si arranca desde cero) y recomendá los equipos del catálogo de Argental que correspondan a cada etapa del proceso productivo.

          Devolvé ÚNICAMENTE los tags [RECOMENDAR:ID] de los productos del catálogo. No agregues texto adicional. Máximo 5 equipos. Si no tenés suficiente información para recomendar, respondé con "ninguno".`,
          },
        ],
      }),
    });

    if (!response.ok || !response.body) return;

    const reader = response.body.getReader();
    const decoder = new TextDecoder("utf-8");
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
          if (delta) raw += delta;
        } catch { }
      }
    }

    const { ids } = parseRecommendations(raw);
    if (ids.length === 0) return;

    const recommendedAgents = getAgentsByIds(ids);

    // Agregar mensaje con las tarjetas de equipos recomendados
   const summaryMessage: ChatMessage = {
  role: "assistant",
  content: "Acá te dejo los links a cada equipo que te recomendé. Hacé clic en \"Ver ficha\" para hablar con el especialista de cada producto y consultarle todos los detalles técnicos:",
      ts: Date.now(),
      recommendedAgents,
    };

    setMessages((prev) => [...prev, summaryMessage]);

  } catch (e) {
    console.error("Error procesando recomendaciones de voz:", e);
  }
};

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

      const { clean, ids } = parseRecommendations(raw);
      const recommendedAgents = ids.length > 0 ? getAgentsByIds(ids) : [];

      const finalMessage: ChatMessage = {
        role: "assistant",
        content: recommendedAgents.length > 0
          ? clean + "\n\nTe dejo acá los links a cada producto que te recomendé, para que puedas ingresar, conocer todos los detalles y hacerle preguntas específicas al especialista de cada equipo:"
          : clean,
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
                Asesor Integral
              </span>
            </div>
            <h2 className="heading-font" style={{
              fontWeight: 600, fontSize: 20, letterSpacing: "-.02em",
              margin: 0, color: "var(--ink)",
            }}>
              Busquetti — Asesor Integral
            </h2>
          </div>
        </div>
      </header>

      <main style={{ maxWidth: 900, margin: "0 auto", padding: "0 24px 40px" }}>

        {/* FAQs */}
        <div style={{ padding: "18px 0 6px" }}>
          <span style={{
            fontSize: 11, fontWeight: 700, letterSpacing: ".12em",
            textTransform: "uppercase", color: "var(--muted-2)",
          }}>
            Preguntas frecuentes
          </span>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 10 }}>
            {FAQS.map((faq, i) => (
              <button
                key={i}
                onClick={() => sendMessage(faq)}
                disabled={loading}
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
                  opacity: loading ? 0.5 : 1,
                }}
              >
                {faq}
              </button>
            ))}
          </div>
        </div>

        {/* CHAT */}
        <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 20, padding: "24px 0 8px" }}>

          {/* Estado vacío */}
          {messages.length === 0 && (
            <div style={{
              display: "flex", flexDirection: "column", alignItems: "center",
              justifyContent: "center", padding: "48px 0", textAlign: "center",
            }}>
              <div style={{
                width: 56, height: 56, borderRadius: "50%",
                background: "var(--navy)", display: "grid", placeItems: "center",
                fontFamily: "'Archivo', sans-serif", fontWeight: 700,
                fontSize: 22, color: "var(--gold)", marginBottom: 16,
              }}>
                B
              </div>
              <p style={{ fontSize: 14, fontWeight: 600, color: "var(--ink)", margin: "0 0 6px" }}>
                Hola, soy Busquetti
              </p>
              <p style={{ fontSize: 13, color: "var(--muted)", margin: 0 }}>
                Contame qué querés producir y te ayudo a elegir los equipos que necesitás
              </p>
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
                    <Markdown className={
                      mine
                        ? "whitespace-pre-wrap leading-relaxed"
                        : "prose prose-sm sm:prose-base max-w-none leading-relaxed [&_p]:my-2 [&_ul]:my-2 [&_ol]:my-2 [&_li]:my-0.5"
                    }>
                      {m.content}
                    </Markdown>
                    <div style={{
                      marginTop: 4, fontSize: 11,
                      color: mine ? "rgba(255,255,255,.5)" : "var(--muted-3)",
                    }}>
                      {mine ? "Vos" : "Busquetti"} · {formatTime(m.ts)}
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

                {/* Tarjetas de equipos recomendados */}
                {!mine && m.recommendedAgents && m.recommendedAgents.length > 0 && (
                  <div style={{ marginLeft: 48, display: "flex", flexDirection: "column", gap: 10 }}>
                    <span style={{
                      fontSize: 11, fontWeight: 700, letterSpacing: ".08em",
                      textTransform: "uppercase", color: "var(--muted-2)",
                    }}>
                      Equipos recomendados
                    </span>
                    <div style={{
                      display: "grid",
                      gridTemplateColumns: "repeat(auto-fill, minmax(238px, 1fr))",
                      gap: 12,
                    }}>
                      {m.recommendedAgents.map((agent) => (
                        <div
                          key={agent.id}
                          style={{
                            border: "1px solid var(--border)", borderRadius: 14,
                            overflow: "hidden", background: "#fff",
                            boxShadow: "0 2px 6px -2px rgba(15,17,21,.06)",
                          }}
                        >
                          {agent.image && (
                            <div style={{
                              height: 126, background: "var(--panel-2)",
                              borderBottom: "1px solid #EDEFF4",
                              display: "flex", alignItems: "center", justifyContent: "center",
                            }}>
                              <img
                                src={agent.image}
                                alt={agent.name}
                                style={{ height: "100%", width: "auto", objectFit: "contain" }}
                              />
                            </div>
                          )}
                          <div style={{ padding: "13px 14px 15px" }}>
                            <span style={{
                              fontSize: 10, fontWeight: 700, letterSpacing: ".09em",
                              textTransform: "uppercase", color: "var(--muted-2)",
                            }}>
                              {agent.family}
                            </span>
                            <h4 className="heading-font" style={{
                              fontWeight: 600, fontSize: 15, letterSpacing: "-.01em",
                              margin: "5px 0 12px", color: "var(--ink)",
                            }}>
                              {agent.name}
                            </h4>
                            <Link
                              href={agent.url as any}
                              target="_blank"
                              rel="noopener noreferrer"
                              style={{
                                display: "inline-flex", alignItems: "center", gap: 6,
                                fontSize: 13, fontWeight: 700, color: "var(--navy)",
                                borderBottom: "2px solid var(--gold)", paddingBottom: 2,
                                textDecoration: "none",
                              }}
                            >
                              Ver ficha ↗
                            </Link>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
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
              disabled={loading}
              placeholder="Describí tu producción, espacio y objetivo…"
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
              disabled={loading}
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
                color: "var(--muted-2)", cursor: "pointer",
                display: "grid", placeItems: "center",
                opacity: loading ? 0.5 : 1,
              }}
            >
              <AudioLines size={16} />
            </button>

            {/* Enviar */}
            <button
              onClick={() => sendMessage()}
              disabled={loading || !input.trim()}
              onMouseEnter={(e) => (e.currentTarget.style.background = "var(--navy)")}
              onMouseLeave={(e) => (e.currentTarget.style.background = "var(--ink)")}
              style={{
                flexShrink: 0, height: 40, padding: "0 20px",
                border: "none", borderRadius: 11, background: "var(--ink)",
                color: "#fff", fontSize: 14, fontWeight: 600, cursor: "pointer",
                display: "flex", alignItems: "center", gap: 6,
                opacity: loading || !input.trim() ? 0.5 : 1,
              }}
            >
              {loading ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
              {loading ? "Enviando" : "Enviar"}
            </button>
          </div>

          <p style={{
            margin: "14px 0 0", fontSize: 11.5, lineHeight: 1.6,
            color: "var(--muted-3)", textAlign: "center",
          }}>
            © {new Date().getFullYear()} Argental · Busquetti Asesor Integral
          </p>
        </div>
      </main>

      {/* Modal voz */}
      <VoiceModeModal
        open={voiceModalOpen}
        onClose={handleCloseVoice}
        state={voiceState}
        messages={voiceMessages}
        error={voiceError}
        agentName="Busquetti | Asesor Integral"
      />
    </div>
  );
}