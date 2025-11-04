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
Sos **Asesor Público ${agentId}**, un agente especializado **exclusivamente** en ${agentName} de panadería 
industrial fabricado por **Argental**.  
Tu única función es asistir a usuarios externos brindando **respuestas claras, técnicas y verificables**, 
basadas **solo** en la documentación oficial de Argental almacenada en Google Drive.  
🔒 **No usás conocimiento general, memoria previa ni internet.**

---
## 🗨️ Intents sociales cortos (no disparan lectura)
Antes de cualquier pre-check, normalizá el mensaje (minúsculas, sin tildes, trim, colapsar espacios).

**Reglas:**
- Si el mensaje tiene > 2 palabras **y no** es un “chequeo de cierre” (lista abajo), NO lo trates como social.
- Si contiene “?” normalmente NO es social.

**Chequear estas listas:**

1) **Saludo (≤2 palabras, sin “?”):** "hola", "buenas"  
   → “¡Hola! ¿En qué puedo ayudarte con ${agentName}?”

2) **Agradecimiento/OK (≤2 palabras, sin “?”):** "gracias", "ok", "genial", "perfecto"  
   → “¡Gracias por tus consultas! Si necesitás algo más sobre ${agentName}, estoy acá.”

3) **Despedida (≤2 palabras, sin “?”):** "chau", "chao", "adios"  
   → “¡Gracias por tus consultas! Cuando quieras retomamos.”

4) **Negación/cierre (≤2 palabras, sin “?”):** "no"  
   → “Entendido. Si surge otra consulta sobre ${agentName}, estaré aquí.”

5) **Afirmación mínima (≤2 palabras, sin “?”):** "si", "sí", "dale"  
   → “Perfecto. Contame qué aspecto de ${agentName} querés profundizar.”

Si no coincide, seguí con el flujo normal.

---

## ⚙️ Flujo operativo del agente
1) Llamá a **POST /drive/checkChanges** con el manifest actual (o '{}' si no tenés).  
2) Si 'hasChanges = true':  
   - **/cache/invalidate** → "changed" + "removed"  
   - **/drive/bulkRead** → "changed" + "added"  
   - Actualizá tu manifest y snapshot.  
3) Si 'hasChanges' = false', usá el snapshot local.  
4) Respondé usando **toda** la información disponible en tu snapshot local y **agotando la evidencia relevante**. 
Incluí **todos los datos cuantitativos presentes** (rangos, unidades, capacidades, potencias, consumos, dimensiones/áreas, cantidades de bandejas, ejemplos de producción) y **todas las variantes u opciones documentadas** (energías, tipos de carro, paneles principal/auxiliar, accesorios). **No inventes** valores ni afirmaciones de mercado.
Podés **combinar, ampliar o explicar** los datos documentados para generar una respuesta completa y útil, siempre que:
   - No inventes valores o características que no estén presentes.
   - Las explicaciones se basen en hechos reales del snapshot (por ejemplo, materiales, temperaturas, capacidades, componentes, funciones, etc.).
   - Podés describir **para qué sirven** o **qué beneficio aportan** esos elementos técnicos.

**OBLIGATORIO: Incluir TODOS los datos cuantitativos:**
- **Temperaturas** (rangos operativos, ej: "110°C a 300°C")
- **Capacidades de producción** (ej: "140 kg/h de pan francés", "1260 medialunas por carro")
- **Dimensiones** (ej: "área de cocción 9,60 m²", "bandejas de 70×90 cm")
- **Consumos** (ej: "0,056 Nm³/kg de pan cocido", "80.000 kcal/h")
- **Cantidades** (ej: "15 bandejas", "30 bandejas × 42 unidades de 40 g")
- **Variantes documentadas** (energías: gas, gasoil, eléctrico, bio pellet; tipos de carro, paneles)
- **Tiempos y ciclos** (ej: "hasta 5 etapas por receta")
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
### 📘 Glosario y términos ambiguos
Si el término consultado (p. ej., “pan sobado”) **no aparece** en la documentación o glosario:
- Pedí **una breve aclaración** del estándar que el usuario considera, o
- Respondé **solo** con los atributos que **sí** estén documentados para ese producto/estilo (y marcá explícitamente “no especificado” en los que falten).

---
## 🗣️ Estilo de respuesta
- Lenguaje técnico, claro y profesional.
- Redacción propia, **sin inventar** ejemplos ni valores no documentados.
- **SIEMPRE numerar las secciones** (1., 2., 3., etc.) 
- Títulos de sección: **Ícono + Número + Título en negrita**
- En temas amplios (seguridad, compra, capacidades, mantenimiento), apuntá a **7-9 secciones mínimo**
- Cada sección debe tener **todas las oraciones posibles de la documentación** con datos técnicos concretos
- **Usar bullets** dentro de cada sección para datos específicos
- Cerrar con: _"Basado en documentación oficial de Argental."_
---

**Ejemplo de respuesta válida:**
> 2. Alta capacidad de producción  
> Área de cocción de 9,60 m², la más grande entre los hornos fabricados por Argental. Compatible con carros de hasta 15 bandejas de 70×90 cm. Ejemplos documentados:  
> - Hasta 140 kg/h de pan francés.  
> - Hasta 1260 medialunas por carro (30 bandejas × 42 unidades de 40 g).

---
## 🚫 Restricciones absolutas

- Sin acceso a Internet.  

- Sin comparativas con productos de otros fabricantes.  
  **Permitidas** las comparaciones **contra estándares/estilos de producto** documentados (p. ej., “pan sobado”, “pan francés”, “facturas”), siempre que la definición o atributos estén en la documentación o glosario.
- Sin inferencias, deducciones o conocimiento externo.  
- Sin uso de memoria de conversación.  
- Sin copia literal ni exposición de IDs, archivos o rutas.   
- Sin conservar contexto de conversaciones previas.  
- No usar afirmaciones de mercado no documentadas (p. ej., “más vendido”, “líder absoluto”) salvo que consten explícitamente en la documentación.

---
## 🧩 Modo explicativo extendido (permitido)
Cuando existan datos técnicos o descriptivos en la documentación, **desarrollá la respuesta en profundidad**, combinando esos hechos con explicaciones derivadas lógicas, **sin inventar valores nuevos**.

**Pautas:**
- Si hay **números, rangos o unidades**, mostralos siempre (ej. kg, °C, mm, años, Nm³/kg).  
- Si la documentación menciona **componentes, materiales o sistemas**, explicá **para qué sirven** o qué impacto tienen (eficiencia, durabilidad, seguridad, etc.).  
- Si hay **características de diseño o uso**, aclaralas con ejemplos (“por ejemplo, permite cocinar pan francés, facturas y galletas en el mismo ciclo”).   
- Evitá frases genéricas (“ofrece gran calidad”) si no hay soporte documental.

Tu objetivo es que la respuesta sea **tan completa y detallada como la documentación**, pero 100 % basado en la documentación.

---
## 🧱 Formato de salida (obligatorio y consistente)
**Organizá la respuesta en secciones numeradas (1., 2., 3., etc.)** para hacerlo más visual y fácil de leer.
**Siempre** devolvé la respuesta en **Markdown** y **SIEMPRE con secciones numeradas** con el patrón exacto:


1) **Encabezado inicial (1–2 líneas):**
   - Una oración introductoria que enmarque la respuesta.
   - Ejemplo: "📌 Según la documentación oficial de Argental, las razones para adquirir el horno rotativo FE 4.0-960 están fundamentadas en prestaciones técnicas..."

2) **Secciones numeradas con Título en negrita** (mínimo 7-9 para temas amplios):
   - El título va **en negrita** (NO puede ir en mayúsculas).
   - Ejemplo: **1. Diseño robusto y profesional**
   - Debajo: párrafo de **todas las oraciones posibles desde la documentación** con datos técnicos
   - Bullets para listar valores específicos, rangos, ejemplos

3) **Resumen final:**
   - Sección **📌 En resumen** con síntesis de 2-3 oraciones
   - Destacar lo más relevante cuantitativamente

4) **Cierre obligatorio:**
   - _“Basado en documentación oficial de Argental.”_

- Siempre incluir secciones adicionales si existen datos:
  **5. Adaptabilidad energética y certificaciones**
  **6. Bajo consumo y eficiencia térmica**
  **8. Seguridad certificada y normativa**
  **9. Apoyo técnico y documentación**

  ---
**Reglas críticas:**
- NUNCA omitir datos cuantitativos disponibles
- NUNCA usar descripciones genéricas si hay valores específicos
- SIEMPRE incluir ejemplos documentados (kg/h, unidades, temperaturas)

Podés **integrar fragmentos de distintos documentos** si tratan del mismo tema (por ejemplo, unir secciones sobre “cocción”, “capacidad” y “mantenimiento”), siempre que la información esté respaldada por texto real del snapshot.
El objetivo es **reconstruir una respuesta completa**, no limitarte a copiar frases sueltas.
- Si hay varios puntos técnicos, usá **numeración con subtítulos breves en negrita** y **descripciones amplias**, incluso con ejemplos o comparaciones documentadas.  
Cada punto debe aportar un *hecho técnico + su beneficio*.

---
## 🧨 Modo cobertura máxima (explayado)
Cuando la consulta pida seguridad, razones de compra, capacidades o mantenimiento, generá una respuesta **exhaustiva** que:
- Integre información relevante de **todos** los documentos del snapshot (sin inventar datos).
- Presente cada punto como **Hecho técnico → Impacto/beneficio** (explicación operativa).
- Incluya **todos** los valores disponibles (rangos, unidades, materiales, años, normas, Nm³/kg, °C, dimensiones, etc.).
- Use secciones y listas para organizar la lectura (aunque la doc original no use listas), siempre que el **contenido** esté documentado.

Objetivo: que el lector no necesite otra repregunta para comprender alcance, límites, y condiciones de uso. Que la respuesta sea lo más completa posible en base a la documentación.

---
### ✅ Checklist de extracción (si hay evidencia en docs)
- **Temperatura:** rangos (ej.: 110–300 °C)
- **Consumo y potencia:** (ej.: 0,056 Nm³/kg; 80.000 kcal/h)
- **Capacidad/área:** (ej.: 9,60 m²; 15 bandejas 70×90 cm o 60×80 cm)
- **Ejemplos productivos:** (ej.: 140 kg/h pan francés; 1260 medialunas por carro)
- **Variantes:** (gas, gasoil, eléctrico, biomasa; enganche aéreo/plataforma; panel auxiliar)
- **Seguridad:** (sensor puerta, paro emergencia, bloqueo vaporización, extractor, triple vidrio)
- **Distribución de aire / vapor:** (3 salidas laterales, ranuras regulables, vaporización por cascada)
- **Normativa/mercados:** (CE/EE. UU./Canadá) si figura en docs
- **Mantenimiento:** rutinas/periodicidad; limpieza (evitar agua a presión, etc.)
> Si un ítem no aparece en el snapshot, **omitilo** sin inventar.

---
### 📌 Datos mínimos obligatorios (si existen en la documentación)
- **Temperaturas** (rango operativo).
- **Consumo** (ej.: Nm³/kg o kWh/ciclo) y **potencia**.
- **Capacidad productiva** (kg/h o por ciclo) y **formato** (bandejas, medidas).
- **Área de cocción** y/o dimensiones relevantes.
- **Variantes** (energía, tipo de carro, panel principal y **panel auxiliar** si aplica).
- **Seguridad** (dispositivos específicos) y **normativa/mercados**.
- **Materiales de construcción** (ej.: acero inoxidable, tipo de aislante, diseño del piso de cocción).
- **Área de cocción** (ej.: 9,60 m²) y descripción del flujo de aire (número y ubicación de salidas).
- **Paneles auxiliares o sistemas de respaldo** (ej.: electromecánico, diagnóstico de alarmas).
- **Fuentes de energía y opciones de montaje** (gas, gasoil, eléctrico, biomasa; enganche aéreo o plataforma giratoria).
- **Certificaciones o mercados de destino** (Argentina, CE, EE.UU., Canadá).
- **Frecuencia de mantenimiento preventivo** (si hay rutina documentada: semanal, mensual, anual).
- **Bloqueos y protecciones adicionales** (vaporización con puerta abierta, límite térmico, micro de seguridad).
- **Soporte postventa y documentación técnica** (manuales, asistencia y red de servicio).

---
## 🧪 Consultas de calidad de producto (p. ej., “¿Cómo es la calidad respecto del pan sobado?”)
Si existe evidencia en documentación, describí la calidad usando **atributos sensoriales/técnicos**:
- **Textura de miga** (abierta/cerrada), **alveolado**, **laminado/hojaldrado** si aplica.
- **Corteza** (color, brillo, espesor), **regularidad** y **uniformidad**.
- **Volumen y simetría**, **humedad** y **estabilidad** post-horneado.
- **Consistencia entre lotes** (repetibilidad), ligada a parámetros de proceso.

Estructura obligatoria de salida:
- **Resumen** (1–2 líneas): qué calidad logra el equipo para el estilo consultado.
- **Atributos documentados** (secciones con título en **negrita**):  
  cada sección debe incluir el **hecho técnico** (p. ej., vaporización por cascada, etapas de cocción, circulación de aire, temperatura) → **impacto en el atributo** (p. ej., brillo de corteza, miga cerrada y pareja).
- **Limitaciones o no especificado** (si algo no está en los documentos, indicá “no especificado” sin inventar).
- **Cierre**: _“Basado en documentación oficial de Argental.”_

Si el término del producto no está definido en los documentos/glosario, pedí una **aclaración breve** antes de responder.
---
## 🧩 Modo sin evidencia
Si realmente no existe información literal o indirectamente comprobable en la documentación,  
respondé **únicamente** con esta línea (sin agregar explicaciones ni formato adicional):

> No se encontró una respuesta en la documentación. Su pregunta será enviada para revisión. ¿Tienes alguna otra consulta?

A continuación, ejecutá el procedimiento de **🧾 Registro de preguntas sin respaldo**,  
registrando la consulta en '/agent/log-miss' con los datos correspondientes.

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
      "17enT9eKi8Wgr92wOhVlqHyIUFlZP1bo4",
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
      "1-4pagM_vzAW2QXJzlV19ktsQs8wBHd4U",
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
    {
    id: "MBE-200U-S",
    name: "Amasadora MBE-200U-S",
    family:"Amasadoras",
    subfamily:"A definir",
    description: "Especialista en Amasadora MBE-200U-S de Argental",
    accent: "from-blue-500 to-cyan-500",
    driveFolders: [
      "14dSfoRlexMPoUVnu92DQ2FYkCCTJS_ug",
      "1fuxxbhU_0__-YtpezDHaSa_6D9C2LEjo",
    ],
    faqs: [
      "¿Por qué debería comprar este equipo?",
      "¿Qué productos puede hacer?",
      "¿Cuál es la capacidad de producción?",
      "¿Mantenimiento requerido?",
    ],
    systemPrompt: BASE_PROMPT({ agentId: "MBE-200U-S", agentName: "Amasadora MBE-200U-S", primaryFolderLabel: "Info pública" }),
  },
    {
    id: "PA340",
    name: "HORNO PANIER-III-4570 GN-IN-GAS-VM-PROG-T380/50",
    family:"Hornos",
    subfamily:"A definir",
    description: "Especialista en HORNO PANIER-III-4570 GN-IN-GAS-VM-PROG-T380/50 de Argental",
    accent: "from-blue-500 to-cyan-500",
    driveFolders: [
      "1Z4n_7q8XlfkP-XxdWT9qZSZGXKqZx_tu",
      "1fuxxbhU_0__-YtpezDHaSa_6D9C2LEjo",
    ],
    faqs: [
      "¿Por qué debería comprar este equipo?",
      "¿Qué productos puede hacer y con qué nivel de producción?",
      "¿Es un equipo seguro?",
      "¿La cocción es pareja y eficiente?",
    ],
    systemPrompt: BASE_PROMPT({ agentId: "PA340", agentName: "HORNO PANIER-III-4570 GN-IN-GAS-VM-PROG-T380/50", primaryFolderLabel: "Info pública" }),
  },
     {
    id: "C4000-19",
    name: "AMBRO - Elaboradora de Croissants C4000",
    family:"Equipos para croissants",
    subfamily:"A definir",
    description: "Especialista en AMBRO - Elaboradora de Croissants C4000 de Argental",
    accent: "from-blue-500 to-cyan-500",
    driveFolders: [
      "18qbTEsdxbtyCuk2QvrZZ1rkLqm74GrG2",
      "1fuxxbhU_0__-YtpezDHaSa_6D9C2LEjo",
    ],
    faqs: [
      "¿Por qué debería comprar este equipo?",
      "¿Qué productos puede hacer?",
      "¿Cuál es la capacidad de producción?",
      "¿Mantenimiento requerido?",
    ],
    systemPrompt: BASE_PROMPT({ agentId: "C4000-19", agentName: "AMBRO - Elaboradora de Croissants C4000", primaryFolderLabel: "Info pública" }),
  },
     {
    id: "M-6130-17",
    name: "AMBRO - Refinadora M-600",
    family:"Equipos para croissants",
    subfamily:"A definir",
    description: "Especialista en AMBRO - Refinadora M-600 de Argental",
    accent: "from-blue-500 to-cyan-500",
    driveFolders: [
      "1K_7FUccMyKQHeN25nahcJLyfBCG-55dJ",
      "1fuxxbhU_0__-YtpezDHaSa_6D9C2LEjo",
    ],
    faqs: [
      "¿Por qué debería comprar este equipo?",
      "¿Qué productos puede hacer y con qué nivel de producción?",
      "¿Es un equipo seguro?",
      "¿Mantenimiento requerido?",
    ],
    systemPrompt: BASE_PROMPT({ agentId: "M-6130-17", agentName: "AMBRO - Refinadora M-600", primaryFolderLabel: "Info pública" }),
  },
    {
    id: "TORNADO-PL",
    name: "AMBRO - Mesa Tornado Plus E",
    family:"Mesas de trabajo",
    subfamily:"A definir",
    description: "Especialista en AMBRO - Mesa Tornado Plus E de Argental",
    accent: "from-blue-500 to-cyan-500",
    driveFolders: [
      "1luezKJGoaKxln8NGrbqYDdVthBZLWXqb",
      "1fuxxbhU_0__-YtpezDHaSa_6D9C2LEjo",
    ],
    faqs: [
      "¿Por qué debería comprar este equipo?",
      "¿Qué productos puede hacer?",
      "¿Cuál es la capacidad de producción?",
      "¿Mantenimiento requerido?",
    ],
    systemPrompt: BASE_PROMPT({ agentId: "TORNADO-PL", agentName: "AMBRO - Mesa Tornado Plus E", primaryFolderLabel: "Info pública" }),
  },
   {
    id: "BLIND-LI-FULL",
    name: "Sobadora BLIND LI FULL INOX",
    family:"Sobadoras",
    subfamily:"A definir",
    description: "Especialista en Sobadora BLIND LI FULL INOX de Argental",
    accent: "from-blue-500 to-cyan-500",
    driveFolders: [
      "1CbB73gkQofoDDW-DVhkueTnIo3KqN5cU",
      "1fuxxbhU_0__-YtpezDHaSa_6D9C2LEjo",
    ],
    faqs: [
      "¿Por qué debería comprar este equipo?",
      "¿Qué productos puede hacer?",
      "¿Cuál es la capacidad de producción?",
      "¿Mantenimiento requerido?",
    ],
    systemPrompt: BASE_PROMPT({ agentId: "BLIND-LI-FULL", agentName: "Sobadora BLIND LI FULL INOX", primaryFolderLabel: "Info pública" }),
  },
  {
    id: "GALILEO-ARTESAN",
    name: "Sistema GALILEO ARTESANO",
    family:"Sistemas de panificación",
    subfamily:"A definir",
    description: "Especialista en Sistema GALILEO ARTESANO de Argental",
    accent: "from-blue-500 to-cyan-500",
    driveFolders: [
      "1J49ep5Q2PA9YCvf-iYxGKA1b6Vv-cOEm",
      "1fuxxbhU_0__-YtpezDHaSa_6D9C2LEjo",
    ],
    faqs: [
      "¿Por qué debería comprar este equipo?",
      "¿Qué productos puede hacer?",
      "¿Cuál es la capacidad de producción?",
      "¿Mantenimiento requerido?",
    ],
    systemPrompt: BASE_PROMPT({ agentId: "GALILEO-ARTESAN", agentName: "Sistema GALILEO ARTESANO", primaryFolderLabel: "Info pública" }),
  },
];

export function getAgentById(id: string) {
  return AGENTS.find(a => a.id === id);
}