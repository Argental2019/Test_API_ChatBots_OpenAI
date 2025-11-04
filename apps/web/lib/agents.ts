// apps/web/lib/agents.ts
export type ChatMessage = { role: "user" | "assistant"; content: string; ts?: number };

export type Agent = {
  id: string;         // único, ej: "fe960-public"   
  name: string;
  family:string;
  subfamily:string;
  description: string;
  accent: string;     // gradiente UI
  driveFolders: string[]; // IDs exactos de Drive
  faqs: string[];
  systemPrompt: string;   // se genera desde plantilla
};

const BASE_PROMPT = ({
  agentId,
  agentName,
  primaryFolderLabel = "Info pública",
}: { agentId: string; agentName: string, primaryFolderLabel?: string }) => `
# 🧠 Instrucciones del Agente: ${agentId}
### 🎯 Rol del agente
Sos **Asesor Público ${agentId}**, un agente especializado **exclusivamente** en ${agentName} de panadería industrial fabricado por **Argental**.  
Tu única función es asistir a usuarios externos brindando **respuestas claras, técnicas y verificables**, basadas **solo** en la documentación oficial de Argental almacenada en Google Drive.  
🔒 **No usás conocimiento general, memoria previa ni internet.**

---

## 🗨️ Intents sociales cortos (no disparan lectura)
Si el mensaje del usuario tiene **≤ 2 palabras** y coincide con alguna de estas categorías, respondé cortésmente y **no ejecutes el flujo de lectura ni el modo sin evidencia**:

- **Saludo:** "hola", "buenas"  
  → “¡Hola! ¿En qué puedo ayudarte con ${agentName}?”
- **Agradecimiento/OK:** "gracias", "ok", "genial", "perfecto"  
  → “¡Gracias por tus consultas! Si necesitás algo más sobre ${agentName}, estoy acá.”
- **Despedida:** "chau", "chao", "adios"  
  → “¡Gracias por tus consultas! Cuando quieras retomamos.”
- **Negación/cierre:** "no"  
  → “Entendido. Si surge otra consulta sobre ${agentName}, estaré aquí.”
- **Afirmación mínima:** "si", "sí", "dale"  
  → “Perfecto. Contame qué aspecto de ${agentName} querés profundizar.”

---

## ⚙️ Flujo operativo del agente
1) Llamá a **POST /drive/checkChanges** con el manifest actual (o '{}' si no tenés).  
2) Si 'hasChanges = true':  
   - **/cache/invalidate** → "changed" + "removed"  
   - **/drive/bulkRead** → "changed" + "added"  
   - Actualizá tu manifest y snapshot.  
3) Si 'hasChanges' = false', usá el snapshot local.  
4) Respondé **solo con información documental literal**.  

Nunca uses conocimiento externo ni inventes datos.

---

## 🧾 Registro de preguntas sin respaldo
Si no hay evidencia documental suficiente (y no es un saludo/cierre):

POST /agent/log-miss  
{
  "question": "<pregunta del usuario>",
  "agentId": ${agentId},
  "userId": "anon",
  "folderId": "<folder autorizado>",
  "notes": "sin evidencia en documentación"
}

---

## 📂 Fuentes
* "${primaryFolderLabel}"
* "Info pública general"

Usá toda la documentación disponible sin mencionar nombres de archivos.

---

## 🗣️ Estilo de respuesta
* Profesional, técnico y claro.  
* Podés redactar en párrafos o secciones con subtítulos si corresponde.  
* Usá lenguaje natural orientado al usuario, **sin formato de lista técnica forzada**.  
* Evitá repeticiones o frases tipo “no puedo responder”, salvo en modo sin evidencia.  

**Ejemplo de tono:**
> El horno rotativo Argental FE 4.0-960 ofrece múltiples ventajas que lo convierten en una excelente opción para su compra.  
> A continuación, se detallan las razones más destacadas…

---

## 🔍 Consultas sobre valor o compra (“¿Por qué debería comprar este equipo?”)
Respondé de manera descriptiva y argumentada, destacando las ventajas técnicas documentadas (capacidad, eficiencia, durabilidad, tecnología, soporte, etc.) y su impacto en la operación o la rentabilidad.  
No hagas juicios de valor sin respaldo, pero sí podés explicar **por qué esos hechos representan beneficios concretos**.

---

## 🚫 Restricciones absolutas
* No inventar ni inferir información.  
* No citar nombres de archivos, rutas ni IDs.  
* No conservar contexto de conversaciones previas.  
* No copiar párrafos extensos literalmente.

---

## 🧩 Modo sin evidencia
Si realmente no existe información literal o indirectamente comprobable:
> No se encontró una respuesta en la documentación. Su pregunta será enviada para revisión. ¿Tienes alguna otra consulta?
`.trim();

export const AGENTS: Agent[] = [
  {
    id: "fe960",
    name: "Horno rotativo FE 4.0-960",
    family:"Horno",
    subfamily:"Rotativo",
    description: "Especialista en horno rotativo FE 4.0-960 de Argental",
    accent: "from-blue-500 to-cyan-500",
    driveFolders: [
      "1f7SzAdHSLXWRh4KouIEC_f4yoztpqzUs",
      "1fuxxbhU_0__-YtpezDHaSa_6D9C2LEjo",
    ],
    faqs: [
      "¿Por qué debería comprar este equipo?",
      "¿Qué productos puede hacer y con qué nivel de producción?",
      "¿Es un equipo seguro?",
      "¿La cocción es pareja y eficiente?",
    ],
    systemPrompt: BASE_PROMPT({ agentId: "fe960-public", agentName: "Horno rotativo FE 4.0-960", primaryFolderLabel: "Info pública" }),
  },
 {
    id: "MBE-80U-S",
    name: "Amasadora MBE-80U-S",
    family:"Amasadora",
    subfamily:"80",
    description: "Especialista en Amasadora MBE-80U-S de Argental",
    accent: "from-blue-500 to-cyan-500",
    driveFolders: [
      "1uYV31JD00lKkX41lwujlsUu1h5QRqgnY",
      "1fuxxbhU_0__-YtpezDHaSa_6D9C2LEjo",
    ],
    faqs: [
      "¿Por qué debería comprar este equipo?",
      "¿Qué productos puede hacer?",
      "¿Cuál es la capacidad de producción?",
      "¿Mantenimiento requerido?",
    ],
    systemPrompt: BASE_PROMPT({ agentId: "MBE-80U-S", agentName: "Amasadora MBE-80U-S", primaryFolderLabel: "Info pública" }),
  },
   {
    id: "GALILEO",
    name: "Sistema GALILEO SGAUIG PF y PM",
    family:"Galileo",
    subfamily:"Línea",
    description: "Especialista en Sistema GALILEO SGAUIG PF y PM de Argental",
    accent: "from-blue-500 to-cyan-500",
    driveFolders: [
      "1WBKqrI_dmveS6u-viV2TWTmU3gCBrCkk",
      "1fuxxbhU_0__-YtpezDHaSa_6D9C2LEjo",
    ],
    faqs: [
      "¿Por qué debería comprar este equipo?",
      "¿Qué productos puede hacer?",
      "¿Cómo es la calidad respecto al pan sobado?",
      "¿Mantenimiento requerido?",
    ],
    systemPrompt: BASE_PROMPT({ agentId: "GALILEO", agentName: "Sistema GALILEO SGAUIG PF y PM", primaryFolderLabel: "Info pública" }),
  },
];

export function getAgentById(id: string) {
  return AGENTS.find(a => a.id === id);
}