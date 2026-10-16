// apps/web/app/advisor/page.tsx
"use client";

import React, { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Home, Send, Loader2, AudioLines, CheckCircle2, AlertCircle } from "lucide-react";
import Markdown from "@/components/markdown";
import { getAgentsByIds, getCatalogAsText } from "@/lib/advisorTools";
import { useElevenLabsVoice } from "@/hooks/useElevenLabsVoice";
import type { VoiceMessage } from "@/hooks/useElevenLabsVoice";
import VoiceModeModal from "@/components/VoiceModeModal";

type ChatMessage = {
  role: "user" | "assistant";
  content: string;
  ts?: number;
    recommendedAgents?: Array<{ id: string; name: string; url: string; family: string; image?: string; aConfirmar?: boolean }>;
  // Globo de la recomendación que todavía no recibió texto: mientras está
  // vacío muestra el indicador de "comparando los equipos".
  esperandoRecomendacion?: boolean;
};

function formatTime(ts?: number) {
  if (!ts) return "";
  return new Date(ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

/**
 * Saca del texto los tags del asesor y devuelve sus IDs:
 * - [RECOMENDAR:ID]  → ids (equipos recomendados)
 * - [ALTERNATIVA:ID] → idsAConfirmar (equipos sugeridos, dimensionamiento a confirmar)
 * El cliente nunca ve los tags.
 */
function parseRecommendations(text: string): { clean: string; ids: string[]; idsAConfirmar: string[] } {
  const ids: string[] = [];
  const idsAConfirmar: string[] = [];

  const clean = text
    .replace(/\[(RECOMENDAR|ALTERNATIVA):([^\]]+)\]/g, (_, tipo: string, id: string) => {
      const lista = tipo === "RECOMENDAR" ? ids : idsAConfirmar;
      const limpio = id.trim();
      if (!lista.includes(limpio)) lista.push(limpio);
      return "";
    })
    .trim();

  return { clean, ids, idsAConfirmar };
}

// Si la respuesta tarda más que esto, se muestra el aviso de espera.
// Es solo un respaldo: las preguntas del diagnóstico tardan pocos segundos y,
// cuando el diagnóstico termina, el aviso de "diagnóstico completo" llega
// enseguida (lo manda route.ts en su propio globo).
const MS_AVISO_ESPERA = 30000;

// Texto que se muestra en el globo de la recomendación mientras todavía no
// llegó ninguna parte (se están comparando los equipos).
const TEXTO_COMPARANDO = "Comparando los equipos para tu producción…";

// Mensaje de bienvenida que se muestra al abrir el chat.
// Es solo visual: no se guarda en "messages" ni se manda al backend.
const MENSAJE_BIENVENIDA =
  "¡Hola! Soy Busquetti, el asesor integral de Argental. Te voy a hacer algunas preguntas sobre tu producción para recomendarte la línea de equipos que mejor se ajusta a tu necesidad. Cuando quieras, escribime para empezar.";

export default function AdvisorPage() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [voiceModalOpen, setVoiceModalOpen] = useState(false);

  // Aviso temporal cuando la respuesta tarda (comparación + recomendación).
  const [esperaLarga, setEsperaLarga] = useState(false);

  // Carga inicial del asesor (catálogo + preparación) al abrir el chat.
  // Mientras no termina, el chat queda bloqueado, igual que en los chats por agente.
  const [asesorListo, setAsesorListo] = useState(false);
  const [errorCarga, setErrorCarga] = useState(false);
  const [toast, setToast] = useState<{ type: "ok" | "err"; msg: string } | null>(null);

  // Evita que la carga se dispare dos veces (en desarrollo, React ejecuta
  // los useEffect dos veces al montar la página).
  const cargaIniciadaRef = useRef(false);

  const endRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const sessionIdRef = useRef<string>(crypto.randomUUID());


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
  }, [messages, esperaLarga]);

  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = "0px";
    el.style.height = Math.min(el.scrollHeight, 200) + "px";
  }, [input]);
  // Pone el cursor en el campo de texto cada vez que queda habilitado:
  // al terminar la carga inicial y después de cada respuesta del asesor.
  // Se hace acá (y no en sendMessage) porque recién en este render el
  // textarea dejó de estar "disabled"; antes el navegador ignora el foco.
  useEffect(() => {
    if (!loading && asesorListo && !voiceModalOpen) {
      inputRef.current?.focus();
    }
  }, [loading, asesorListo, voiceModalOpen]);
  // Lee el catálogo y dispara la preparación para esta conversación.
  const cargarAsesor = async () => {
    setErrorCarga(false);
    setToast(null);

    try {
      const r = await fetch("/api/advisor/iniciar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId: sessionIdRef.current }),
      });

      const data = await r.json().catch(() => null);

      if (!r.ok || !data?.ok) {
        throw new Error(data?.error || `Error ${r.status}`);
      }

      setAsesorListo(true);
      setToast({ type: "ok", msg: "Catálogo cargado correctamente." });
      setTimeout(() => setToast(null), 2500);
    } catch (e) {
      console.error("No se pudo iniciar el asesor:", e);
      setErrorCarga(true);
      setToast({ type: "err", msg: "No pude cargar el catálogo del asesor." });
    }
  };

  // Al abrir el chat se carga todo una sola vez.
  useEffect(() => {
    if (cargaIniciadaRef.current) return;
    cargaIniciadaRef.current = true;
    cargarAsesor();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const sendMessage = async (text?: string) => {
    const content = (text ?? input).trim();
    if (!content || loading || !asesorListo) return;
    // La primera vez que se envía un mensaje creamos la sesión.
    // Los mensajes siguientes reutilizan exactamente el mismo ID.
    if (!sessionIdRef.current) {
      sessionIdRef.current = crypto.randomUUID();
    }

    const userMessage: ChatMessage = { role: "user", content, ts: Date.now() };
    const history = [...messages, userMessage];

    setMessages(history);
    setInput("");
    setLoading(true);
    inputRef.current?.focus();

    // Si la respuesta tarda, se muestra el aviso de espera.
    const timerEspera = setTimeout(() => setEsperaLarga(true), MS_AVISO_ESPERA);

    try {
      const response = await fetch("/api/advisor", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "text/event-stream",
        },
                    body: JSON.stringify({
            sessionId: sessionIdRef.current,

            messages: history.map((m) => ({
              role: m.role,
              content: m.content,
            })),
          }),
      });

      // Llegó la respuesta: se saca el aviso antes de mostrarla.
      clearTimeout(timerEspera);
      setEsperaLarga(false);

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

            // Mensaje final ya validado por el backend (recomendación en
            // streaming): reemplaza todo lo que se fue mostrando.
            const final = parsed.choices?.[0]?.delta?.advisor_final;
            const delta = parsed.choices?.[0]?.delta?.content;

            // Aviso de "diagnóstico completo": va en su propio globo, y se
            // abre uno nuevo (vacío) donde se va a escribir la recomendación.
            const aviso = parsed.choices?.[0]?.delta?.advisor_aviso;

            if (typeof aviso === "string") {
              const tsRecomendacion = Date.now();

              setMessages((prev) => {
                const nm = [...prev];
                nm[nm.length - 1] = { role: "assistant", content: aviso, ts: assistantMessage.ts };
                return [...nm, { role: "assistant", content: "", ts: tsRecomendacion, esperandoRecomendacion: true }];
              });

              assistantMessage = { role: "assistant", content: "", ts: tsRecomendacion, esperandoRecomendacion: true };
              raw = "";
              continue;
            }

            if (typeof final === "string") {
              raw = final;
            } else if (delta) {
              raw += delta;
            } else {
              continue;
            }

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

      const { clean, ids, idsAConfirmar } = parseRecommendations(raw);

      // Primero los recomendados y después los sugeridos a confirmar.
      const recommendedAgents = [
        ...(ids.length > 0 ? getAgentsByIds(ids) : []).map((agent) => ({ ...agent, aConfirmar: false })),
        ...(idsAConfirmar.length > 0 ? getAgentsByIds(idsAConfirmar) : []).map((agent) => ({ ...agent, aConfirmar: true })),
      ];

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
      clearTimeout(timerEspera);
      setEsperaLarga(false);
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
            <h2 className="mt-2 text-base font-semibold text-gray-900">Busquetti | Asesor Integral</h2>
            <p className="text-xs text-gray-500">Contame qué necesitás y te recomiendo los equipos ideales</p>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-4xl px-4">
        {/* Aviso de carga (mismo formato que los chats por agente) */}
        {toast && (
          <div
            className={`mt-4 flex items-center gap-2 rounded-xl border px-4 py-3 text-sm ${
              toast.type === "ok"
                ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                : "border-rose-200 bg-rose-50 text-rose-700"
            }`}
          >
            {toast.type === "ok" ? (
              <CheckCircle2 className="size-4" />
            ) : (
              <AlertCircle className="size-4" />
            )}
            {toast.msg}
          </div>
        )}

        {/* FAQs */}
        <div className="mt-6 flex flex-wrap gap-2">
          {FAQS.map((faq, i) => (
            <button
              key={i}
              onClick={() => sendMessage(faq)}
              disabled={loading || !asesorListo}
              className="rounded-full border bg-white px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {faq}
            </button>
          ))}
        </div>

        {/* Chat */}
        <section className="mt-6 rounded-2xl border bg-white shadow-sm">
          <div className="max-h-[64vh] overflow-y-auto p-4 sm:p-6">

            {!asesorListo ? (
              errorCarga ? (
                // La carga falló: se puede reintentar sin recargar la página.
                <div className="flex flex-col items-start gap-3 text-sm text-gray-700">
                  <span>No pude cargar el catálogo del asesor.</span>
                  <button
                    type="button"
                    onClick={cargarAsesor}
                    className="rounded-lg border px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
                  >
                    Reintentar
                  </button>
                </div>
              ) : (
                // Mientras carga (mismo esqueleto que los chats por agente).
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
              )
            ) : (
              /* Bienvenida de Busquetti (solo visual, no se manda al backend) */
              <div className="mb-3 flex items-end gap-2 justify-start">
                <div className="shrink-0 size-10 rounded-full overflow-hidden border border-gray-200 shadow-sm bg-white">
                  <img
                    src="/busquetti/LogoBusquetti.jpg"
                    alt="Busquetti"
                    className="w-full h-full object-cover object-[center_12%] scale-[1.8]"
                  />
                </div>
                <div className="w-fit max-w-[85%] rounded-2xl border bg-white px-5 py-3 text-sm leading-6 text-gray-900 shadow-sm">
                  <p className="leading-relaxed">{MENSAJE_BIENVENIDA}</p>
                  <div className="mt-1 text-[11px] text-gray-500">Busquetti</div>
                </div>
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
                      {!mine && m.esperandoRecomendacion && !m.content ? (
                        // Globo de la recomendación todavía vacío: se están
                        // comparando los equipos.
                        <div className="flex items-center gap-2 text-gray-500">
                          <Loader2 className="size-4 animate-spin" />
                          <span>{TEXTO_COMPARANDO}</span>
                        </div>
                      ) : (
                        <Markdown
                          className={
                            mine
                              ? "whitespace-pre-wrap leading-relaxed"
                              : "prose prose-sm sm:prose-base max-w-none leading-relaxed [&_p]:my-2 [&_ul]:my-2 [&_ol]:my-2 [&_li]:my-0.5"
                          }
                        >
                          {m.content}
                        </Markdown>
                      )}
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
                            <div className="flex items-center gap-3">
                              {agent.image && (
                                <div className="shrink-0 size-14 rounded-lg overflow-hidden bg-gray-50 border">
                                  <img
                                    src={agent.image}
                                    alt={agent.name}
                                    className="w-full h-full object-contain"
                                  />
                                </div>
                              )}
                              <div>
                                <p className="text-sm font-semibold text-gray-900">{agent.name}</p>
                                <p className="text-xs text-gray-500">{agent.family}</p>
                                {agent.aConfirmar && (
                                  <span className="mt-1 inline-block rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-700">
                                    Dimensionamiento a confirmar
                                  </span>
                                )}
                              </div>
                            </div>
                            <Link
                              href={agent.url as any}
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

            {/* Aviso temporal (respaldo) si una respuesta tarda más de lo normal */}
            {loading && esperaLarga && (
              <div className="mb-3 flex items-end gap-2 justify-start">
                <div className="shrink-0 size-10 rounded-full overflow-hidden border border-gray-200 shadow-sm bg-white">
                  <img
                    src="/busquetti/LogoBusquetti.jpg"
                    alt="Busquetti"
                    className="w-full h-full object-cover object-[center_12%] scale-[1.8]"
                  />
                </div>
                <div className="w-fit max-w-[85%] rounded-2xl border bg-white px-5 py-3 text-sm leading-6 text-gray-700 shadow-sm">
                  <div className="flex items-center gap-2">
                    <Loader2 className="size-4 animate-spin text-gray-500" />
                    <span>
                      Estoy procesando tu respuesta, aguardá un momento…
                    </span>
                  </div>
                </div>
              </div>
            )}

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
                               // Solo lectura (no "disabled") mientras espera: así el cursor
                // no se va del campo y se puede escribir apenas llega la respuesta.
                readOnly={loading || !asesorListo}
                placeholder={asesorListo ? "Contame qué necesitás producir…" : "Cargando catálogo…"}
                className={`max-h-[200px] flex-1 resize-none rounded-xl border px-4 py-3 text-sm text-gray-900 placeholder:text-gray-400 focus:border-gray-900 focus:outline-none ${
                  loading || !asesorListo ? "cursor-not-allowed bg-gray-50" : ""
                }`}
              />

              {/* Botón modo voz */}
              <button
                type="button"
                onClick={handleOpenVoice}
                disabled={loading || !asesorListo}
                className="mb-1 inline-flex items-center justify-center rounded-full border px-3 py-3 text-sm shadow-sm transition bg-white text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
                title="Modo conversación por voz"
              >
                <AudioLines className="size-4" />
              </button>

              <button
                onClick={() => sendMessage()}
                disabled={loading || !asesorListo || !input.trim()}
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

      {/* Modal de modo voz */}
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