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
    family:"Hornos",
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
    family:"Amasadoras",
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
   {
    id: "COMPRESSLINE",
    name: "AMBRO - Mesa modular COMPRESSLINE",
    family:"Líneas Modulares",
    subfamily:"A definir",
    description: "Especialista en AMBRO - Mesa modular COMPRESSLINE de Argental",
    accent: "from-blue-500 to-cyan-500",
    driveFolders: [
      "1-vX4iYDdYgVVOik9_w1mhP1q_7daCD9_",
      "1fuxxbhU_0__-YtpezDHaSa_6D9C2LEjo",
    ],
    faqs: [
      "¿Por qué debería comprar este equipo?",
      "¿Qué productos puede hacer?",
      "¿Cuál es la capacidad de producción?",
      "¿Mantenimiento requerido?",
    ],
    systemPrompt: BASE_PROMPT({ agentId: "COMPRESSLINE", agentName: "AMBRO - Mesa modular COMPRESSLINE", primaryFolderLabel: "Info pública" }),
  },
 {
    id: "LINEA-CIABATTA",
    name: "AMBRO - LINEA CIABATTA",
    family:"Sistemas de panificación",
    subfamily:"A definir",
    description: "Especialista en AMBRO - LINEA CIABATTA de Argental",
    accent: "from-blue-500 to-cyan-500",
    driveFolders: [
      "17klf-CMD02lrvQcZrL0_C7D8cYYHBS7j",
      "1fuxxbhU_0__-YtpezDHaSa_6D9C2LEjo",
    ],
    faqs: [
      "¿Por qué debería comprar este equipo?",
      "¿Qué productos puede hacer?",
      "¿Cuál es la capacidad de producción?",
      "¿Mantenimiento requerido?",
    ],
    systemPrompt: BASE_PROMPT({ agentId: "LINEA-CIABATTA", agentName: "AMBRO - LINEA CIABATTA", primaryFolderLabel: "Info pública" }),
  },
 {
    id: "FOGLIA",
    name: "AMBRO - Laminadora Automática FOGLIA",
    family:"Laminadoras",
    subfamily:"A definir",
    description: "Especialista en AMBRO - Laminadora Automática FOGLIA de Argental",
    accent: "from-blue-500 to-cyan-500",
    driveFolders: [
      "13a8Zj7XWNK_Ghp-yOtekHv4TPh0joAJy",
      "1fuxxbhU_0__-YtpezDHaSa_6D9C2LEjo",
    ],
    faqs: [
      "¿Por qué debería comprar este equipo?",
      "¿Qué productos puede hacer y con qué nivel de producción?",
      "¿Es un equipo seguro?",
      "¿Mantenimiento requerido?",
    ],
    systemPrompt: BASE_PROMPT({ agentId: "FOGLIA", agentName: "AMBRO - Laminadora Automática FOGLIA", primaryFolderLabel: "Info pública" }),
  },
 {
    id: "TORNADO-PL-II",
    name: "AMBRO - Mesa Tornado Plus II",
    family:"Mesas de trabajo",
    subfamily:"A definir",
    description: "Especialista en AMBRO - Mesa Tornado Plus II de Argental",
    accent: "from-blue-500 to-cyan-500",
    driveFolders: [
      "1NRQKDxmiN41iancltwE9Ird2Kvb12MGO",
      "1fuxxbhU_0__-YtpezDHaSa_6D9C2LEjo",
    ],
    faqs: [
      "¿Por qué debería comprar este equipo?",
      "¿Qué productos puede hacer?",
      "¿Es un equipo seguro?",
      "¿Mantenimiento requerido?",
    ],
    systemPrompt: BASE_PROMPT({ agentId: "TORNADO-PL-II", agentName: "AMBRO - Mesa Tornado Plus II", primaryFolderLabel: "Info pública" }),
  },

 {
    id: "GT-38",
    name: "Grupo trinchador GT38-I Mod.",
    family:"Trinchadoras",
    subfamily:"A definir",
    description: "Especialista en Grupo trinchador GT38-I Mod. de Argental",
    accent: "from-blue-500 to-cyan-500",
    driveFolders: [
      "1l8aLHxZgHWM1e7p7-c2zLCepbGUFnWY6",
      "1fuxxbhU_0__-YtpezDHaSa_6D9C2LEjo",
    ],
    faqs: [
      "¿Por qué debería comprar este equipo?",
      "¿Qué productos puede hacer?",
      "¿Cuál es la capacidad de producción?",
      "¿Mantenimiento requerido?",
    ],
    systemPrompt: BASE_PROMPT({ agentId: "GT-38", agentName: "Grupo trinchador GT38-I Mod.", primaryFolderLabel: "Info pública" }),
  },
 {
    id: "FE-III-315-ROTATIVO",
    name: "Horno rotativo FE III-315",
    family:"Hornos",
    subfamily:"A definir",
    description: "Especialista en Horno rotativo FE III-315 de Argental",
    accent: "from-blue-500 to-cyan-500",
    driveFolders: [
      "17MVKw06b02TN8JVaSiJFA4n_SscxhzIf",
      "1fuxxbhU_0__-YtpezDHaSa_6D9C2LEjo",
    ],
    faqs: [
      "¿Por qué debería comprar este equipo?",
      "¿Qué productos puede hacer y con qué nivel de producción?",
      "¿La cocción es pareja y eficiente?",
      "¿Mantenimiento requerido?",
    ],
    systemPrompt: BASE_PROMPT({ agentId: "FE-III-315-ROTATIVO", agentName: "Horno rotativo FE III-315", primaryFolderLabel: "Info pública" }),
  },

 {
    id: "360-BE",
    name: "SOBADORA AUTOMATICA 360 BE",
    family:"Sobadoras",
    subfamily:"A definir",
    description: "Especialista en SOBADORA AUTOMATICA 360 BE de Argental",
    accent: "from-blue-500 to-cyan-500",
    driveFolders: [
      "1UHB2yzlz6y-xRTW9a2KS6C-R6vCrxTvI",
      "1fuxxbhU_0__-YtpezDHaSa_6D9C2LEjo",
    ],
    faqs: [
      "¿Por qué debería comprar este equipo?",
      "¿Qué productos puede hacer y con qué nivel de producción?",
      "¿Es un equipo seguro?",
      "¿Mantenimiento requerido?",
    ],
    systemPrompt: BASE_PROMPT({ agentId: "360-BE", agentName: "SOBADORA AUTOMATICA 360 BE", primaryFolderLabel: "Info pública" }),
  },


 {
    id: "CORBOLI",
    name: "Cortadora-Bollera Corboli",
    family:"Sobadoras",
    subfamily:"A definir",
    description: "Especialista en Cortadora-Bollera Corboli de Argental",
    accent: "from-blue-500 to-cyan-500",
    driveFolders: [
      "1Bf_IQClyuuKMtDTDTlRMqM1Zw1r6pxFE",
      "1fuxxbhU_0__-YtpezDHaSa_6D9C2LEjo",
    ],
    faqs: [
      "¿Por qué debería comprar este equipo?",
      "¿Qué productos puede hacer?",
      "¿Es un equipo seguro?",
      "¿Mantenimiento requerido?",
    ],
    systemPrompt: BASE_PROMPT({ agentId: "CORBOLI", agentName: "Cortadora-Bollera Corboli", primaryFolderLabel: "Info pública" }),
  },
 {
    id: "MBE-160HA",
    name: "Amasadora MBE-160HA",
    family:"Amasadoras",
    subfamily:"A definir",
    description: "Especialista en Amasadora MBE-160HA",
    accent: "from-blue-500 to-cyan-500",
    driveFolders: [
      "1evTLb9DevWuh09ei-sI-t43y8FpA0dZ4",
      "1fuxxbhU_0__-YtpezDHaSa_6D9C2LEjo",
    ],
    faqs: [
      "¿Por qué debería comprar este equipo?",
      "¿Qué productos puede hacer?",
      "¿Es un equipo seguro?",
      "¿Mantenimiento requerido?",
    ],
    systemPrompt: BASE_PROMPT({ agentId: "MBE-160HA", agentName: "Amasadora MBE-160HA", primaryFolderLabel: "Info pública" }),
  },

 {
    id: "DB",
    name: "Divisora Argental DB1000",
    family:"Divisoras",
    subfamily:"A definir",
    description: "Especialista en Divisora Argental DB1000",
    accent: "from-blue-500 to-cyan-500",
    driveFolders: [
      "1vjXBuzouDoFRF6krwOjFculpJPEu8PP1",
      "1fuxxbhU_0__-YtpezDHaSa_6D9C2LEjo",
    ],
    faqs: [
      "¿Por qué debería comprar este equipo?",
      "¿Qué productos puede hacer?",
      "¿Es un equipo seguro?",
      "¿Mantenimiento requerido?",
    ],
    systemPrompt: BASE_PROMPT({ agentId: "DB", agentName: "Divisora Argental DB1000", primaryFolderLabel: "Info pública" }),
  },

 {
    id: "FE4-0-472",
    name: "Horno rotativo FE 4.0-472",
    family:"Hornos",
    subfamily:"A definir",
    description: "Especialista en Horno rotativo FE 4.0-472",
    accent: "from-blue-500 to-cyan-500",
    driveFolders: [
      "1G8BR6eNfrTAl3twQTlidrfqsN5BJ8pL5",
      "1fuxxbhU_0__-YtpezDHaSa_6D9C2LEjo",
    ],
    faqs: [
      "¿Por qué debería comprar este equipo?",
      "¿Qué productos puede hacer y con qué nivel de producción?",
      "¿Es un equipo seguro?",
      "¿La cocción es pareja y eficiente?",
    ],
    systemPrompt: BASE_PROMPT({ agentId: "FE4-0-472", agentName: "Horno rotativo FE 4.0-472", primaryFolderLabel: "Info pública" }),
  },

 {
    id: "FE-BIO-960-y-472",
    name: "Horno rotativo FE 4.0-472 BIO",
    family:"Hornos",
    subfamily:"A definir",
    description: "Especialista en Horno rotativo FE 4.0-472 BIO",
    accent: "from-blue-500 to-cyan-500",
    driveFolders: [
      "1GNuLy8NigfTRvMrhWvBY5CgQ1XadM2gY",
      "1fuxxbhU_0__-YtpezDHaSa_6D9C2LEjo",
    ],
    faqs: [
      "¿Por qué debería comprar este equipo?",
      "¿Qué productos puede hacer y con qué nivel de producción?",
      "¿La cocción es pareja y eficiente?",
      "¿Mantenimiento requerido?",
    ],
    systemPrompt: BASE_PROMPT({ agentId: "FE-BIO-960-y-472", agentName: "Horno rotativo FE 4.0-472 BIO", primaryFolderLabel: "Info pública" }),
  },
   {
    id: "ARM-4000",
    name: "AMBRO - Cabezal Armador C4000",
    family:"Equipos para croissants",
    subfamily:"A definir",
    description: "Especialista en AMBRO - Cabezal Armador C4000 de Argental",
    accent: "from-blue-500 to-cyan-500",
    driveFolders: [
      "10goSXm0032C7hz_21KPFMIAixgysud5i",
      "1fuxxbhU_0__-YtpezDHaSa_6D9C2LEjo",
    ],
    faqs: [
      "¿Por qué debería comprar este equipo?",
      "¿Qué productos puede hacer?",
      "¿Cuál es la capacidad de producción?",
      "¿Mantenimiento requerido?",
    ],
    systemPrompt: BASE_PROMPT({ agentId: "ARM-4000", agentName: "AMBRO - Cabezal Armador C4000", primaryFolderLabel: "Info pública" }),
  },
   {
    id: "RAPIFREDDO-T5",
    name: "Túnel Ultracongelador RAPIFREDDO 70X90 T2C-T3C-T4C-T5C",
    family:"Ultracongeladores",
    subfamily:"A definir",
    description: "Especialista en Túnel Ultracongelador RAPIFREDDO 70X90 T2C-T3C-T4C-T5C de Argental",
    accent: "from-blue-500 to-cyan-500",
    driveFolders: [
      "1ePGsC1PfHDTVNKpQtQFXAT4iz9FXRoUx",
      "1fuxxbhU_0__-YtpezDHaSa_6D9C2LEjo",
    ],
    faqs: [
      "¿Por qué debería comprar este equipo?",
      "¿Qué productos puede hacer?",
      "¿Cuál es la capacidad de producción?",
      "¿Mantenimiento requerido?",
    ],
    systemPrompt: BASE_PROMPT({ agentId: "RAPIFREDDO-T5", agentName: "Túnel Ultracongelador RAPIFREDDO 70X90 T2C-T3C-T4C-T5C", primaryFolderLabel: "Info pública" }),
  },
  {
    id: "GTC-MODULAR",
    name: "Grupo trinchador GTC-I Mod.",
    family:"Trinchadoras",
    subfamily:"A definir",
    description: "Especialista en Grupo trinchador GTC-I Mod. de Argental",
    accent: "from-blue-500 to-cyan-500",
    driveFolders: [
      "18QvdumOvayNEdGTbigHxBfeAynddycGf",
      "1fuxxbhU_0__-YtpezDHaSa_6D9C2LEjo",
    ],
    faqs: [
      "¿Por qué debería comprar este equipo?",
      "¿Qué productos puede hacer?",
      "¿Cuál es la capacidad de producción?",
      "¿Mantenimiento requerido?",
    ],
    systemPrompt: BASE_PROMPT({ agentId: "GTC-MODULAR", agentName: "Grupo trinchador GTC-I Mod.", primaryFolderLabel: "Info pública" }),
  },
   {
    id: "H2C",
    name: "Horno de piso H2C",
    family:"Horno",
    subfamily:"A definir",
    description: "Especialista en Horno de piso H2C de Argental",
    accent: "from-blue-500 to-cyan-500",
    driveFolders: [
      "1-bW6ZDYHBnFffhThHfK348RYzpbUpzTk",
      "1fuxxbhU_0__-YtpezDHaSa_6D9C2LEjo",
    ],
    faqs: [
      "¿Por qué debería comprar este equipo?",
      "¿Qué productos puede hacer?",
      "¿Cuál es la capacidad de producción?",
      "¿Mantenimiento requerido?",
    ],
    systemPrompt: BASE_PROMPT({ agentId: "H2C", agentName: "Horno de piso H2C", primaryFolderLabel: "Info pública" }),
  },
   {
    id: "DBS",
    name: "DIVISORA-BOLLERA SEMI. PANIER DBS30-100-30 T380/50",
    family:"Divisoras",
    subfamily:"A definir",
    description: "Especialista en DIVISORA-BOLLERA SEMI. PANIER DBS30-100-30 T380/50 de Argental",
    accent: "from-blue-500 to-cyan-500",
    driveFolders: [
      "1ecYCrRantUOW9YAnJ_e2opAlhrB4hPDb",
      "1fuxxbhU_0__-YtpezDHaSa_6D9C2LEjo",
    ],
    faqs: [
      "¿Por qué debería comprar este equipo?",
      "¿Qué productos puede hacer?",
      "¿Cuál es la capacidad de producción?",
      "¿Mantenimiento requerido?",
    ],
    systemPrompt: BASE_PROMPT({ agentId: "DBS", agentName: "DIVISORA-BOLLERA SEMI. PANIER DBS30-100-30 T380/50", primaryFolderLabel: "Info pública" }),
  },
   {
    id: "CFA",
    name: "Cámara Fermentación CFA INOX. 2C/4C/6C",
    family:"Cámaras de fermentacíón",
    subfamily:"A definir",
    description: "Especialista en Cámara Fermentación CFA INOX. 2C/4C/6C de Argental",
    accent: "from-blue-500 to-cyan-500",
    driveFolders: [
      "1hyU5_fHfVZwuYedFaFhfxyCrY-lFN2Ak",
      "1fuxxbhU_0__-YtpezDHaSa_6D9C2LEjo",
    ],
    faqs: [
      "¿Por qué debería comprar este equipo?",
      "¿Qué productos puede hacer?",
      "¿Cuál es la capacidad de producción?",
      "¿Mantenimiento requerido?",
    ],
    systemPrompt: BASE_PROMPT({ agentId: "CFA", agentName: "Cámara Fermentación CFA INOX. 2C/4C/6C", primaryFolderLabel: "Info pública" }),
  },
   {
    id: "EU2C-MODULAR",
    name: "Equipo Unific. Mod. INOX.EU2C-I",
    family:"Trinchadoras",
    subfamily:"A definir",
    description: "Especialista en Equipo Unific. Mod. INOX.EU2C-I de Argental",
    accent: "from-blue-500 to-cyan-500",
    driveFolders: [
      "1Afu3F8mKvnEPxATYT5yOndYeD4QrzQcV",
      "1fuxxbhU_0__-YtpezDHaSa_6D9C2LEjo",
    ],
    faqs: [
      "¿Por qué debería comprar este equipo?",
      "¿Qué productos puede hacer?",
      "¿Cuál es la capacidad de producción?",
      "¿Mantenimiento requerido?",
    ],
    systemPrompt: BASE_PROMPT({ agentId: "EU2C-MODULAR", agentName: "Equipo Unific. Mod. INOX.EU2C-I", primaryFolderLabel: "Info pública" }),
  },
   {
    id: "ELEVA",
    name: "Elevador ELEVA-T160H",
    family:"Amasadoras",
    subfamily:"A definir",
    description: "Especialista en Elevador ELEVA-T160H de Argental",
    accent: "from-blue-500 to-cyan-500",
    driveFolders: [
      "Cdit1S2Om1BaYh9Q5rx1INSSu1vx",
      "1fuxxbhU_0__-YtpezDHaSa_6D9C2LEjo",
    ],
    faqs: [
      "¿Por qué debería comprar este equipo?",
      "¿Qué productos puede hacer?",
      "¿Cuál es la capacidad de producción?",
      "¿Mantenimiento requerido?",
    ],
    systemPrompt: BASE_PROMPT({ agentId: "ELEVA", agentName: "Elevador ELEVA-T160H", primaryFolderLabel: "Info pública" }),
  },
  {
    id: "MBE-40T",
    name: "Amasadora MBE-40T",
    family:"Amasadoras",
    subfamily:"A definir",
    description: "Especialista en Amasadora MBE-40T de Argental",
    accent: "from-blue-500 to-cyan-500",
    driveFolders: [
      "1qqSGPpt9yACTlbMKNKyYgyoEDjClN0Pk",
      "1fuxxbhU_0__-YtpezDHaSa_6D9C2LEjo",
    ],
    faqs: [
      "¿Por qué debería comprar este equipo?",
      "¿Qué productos puede hacer?",
      "¿Cuál es la capacidad de producción?",
      "¿Mantenimiento requerido?",
    ],
    systemPrompt: BASE_PROMPT({ agentId: "MBE-40T", agentName: "Amasadora MBE-40T", primaryFolderLabel: "Info pública" }),
  },
  {
    id: "SGAU-MODULAR",
    name: "Grupo Automático Universal SGAUI",
    family:"Trinchadoras",
    subfamily:"A definir",
    description: "Especialista en Grupo Automático Universal SGAUI de Argental",
    accent: "from-blue-500 to-cyan-500",
    driveFolders: [
      "1Bz-GpG8IdP8hacJGAXMANFwjuSvWnYUD",
      "1fuxxbhU_0__-YtpezDHaSa_6D9C2LEjo",
    ],
    faqs: [
      "¿Por qué debería comprar este equipo?",
      "¿Qué productos puede hacer?",
      "¿Cuál es la capacidad de producción?",
      "¿Mantenimiento requerido?",
    ],
    systemPrompt: BASE_PROMPT({ agentId: "SGAU-MODULAR", agentName: "Grupo Automático Universal SGAUI", primaryFolderLabel: "Info pública" }),
  },
  {
    id: "HORECA",
    name: "HORNO RÁPIDO ARGENTAL HORECA ",
    family:"A definir",
    subfamily:"A definir",
    description: "Especialista en HORNO RÁPIDO ARGENTAL HORECA  de Argental",
    accent: "from-blue-500 to-cyan-500",
    driveFolders: [
      "1ZWIIWH7GH_bUJWYwn4uVrVuhTmi5PM-8",
      "1fuxxbhU_0__-YtpezDHaSa_6D9C2LEjo",
    ],
    faqs: [
      "¿Por qué debería comprar este equipo?",
      "¿Qué productos puede hacer?",
      "¿Cuál es la capacidad de producción?",
      "¿Mantenimiento requerido?",
    ],
    systemPrompt: BASE_PROMPT({ agentId: "HORECA", agentName: "HORNO RÁPIDO ARGENTAL HORECA ", primaryFolderLabel: "Info pública" }),
  },
  {
    id: "NATO",
    name: "HORNO CONVECTOR PANIER MANUAL HCP NATO",
    family:"A definir",
    subfamily:"A definir",
    description: "Especialista en HORNO CONVECTOR PANIER MANUAL HCP NATO de Argental",
    accent: "from-blue-500 to-cyan-500",
    driveFolders: [
      "1W8aWFHz-GWtyOE8ZrdFsB-UlbsumnNPG",
      "1fuxxbhU_0__-YtpezDHaSa_6D9C2LEjo",
    ],
    faqs: [
      "¿Por qué debería comprar este equipo?",
      "¿Qué productos puede hacer?",
      "¿Cuál es la capacidad de producción?",
      "¿Mantenimiento requerido?",
    ],
    systemPrompt: BASE_PROMPT({ agentId: "NATO", agentName: "HORNO CONVECTOR PANIER MANUAL HCP NATO", primaryFolderLabel: "Info pública" }),
  },
  {
    id: "MINICONV",
    name: "HORNO CONVECTOR PANIER MANUAL MINICONV",
    family:"A definir",
    subfamily:"A definir",
    description: "Especialista en HORNO CONVECTOR PANIER MANUAL MINICONV de Argental",
    accent: "from-blue-500 to-cyan-500",
    driveFolders: [
      "1JbPeo36mEdBm4-vohz_fWherwJe8iisz",
      "1fuxxbhU_0__-YtpezDHaSa_6D9C2LEjo",
    ],
    faqs: [
      "¿Por qué debería comprar este equipo?",
      "¿Qué productos puede hacer?",
      "¿Cuál es la capacidad de producción?",
      "¿Mantenimiento requerido?",
    ],
    systemPrompt: BASE_PROMPT({ agentId: "MINICONV", agentName: "HORNO CONVECTOR PANIER MANUAL MINICONV", primaryFolderLabel: "Info pública" }),
  },
  //Amarillos
   {
    id: "DOS-AR",
    name: "Dosificador de Agua DOS-AR",
    family:"Dosificador de agua",
    subfamily:"A definir",
    description: "Especialista en Dosificador de Agua DOS-AR de Argental",
    accent: "from-blue-500 to-cyan-500",
    driveFolders: [
      "1ffFIgzea-t7UQiqgBKllwiGY3yvL5Qus",
      "1fuxxbhU_0__-YtpezDHaSa_6D9C2LEjo",
    ],
    faqs: [
      "¿Por qué debería comprar este equipo?",
      "¿Qué productos puede hacer?",
      "¿Cuál es la capacidad de producción?",
      "¿Mantenimiento requerido?",
    ],
    systemPrompt: BASE_PROMPT({ agentId: "DOS-AR", agentName: "Dosificador de Agua DOS-AR", primaryFolderLabel: "Info pública" }),
  },

 {
    id: "PA390",
    name: "HORNO PANIER-III-7090 GN-IN-GAS-VM-PROG-T380/50",
    family:"Hornos",
    subfamily:"A definir",
    description: "Especialista en HORNO PANIER-III-7090 GN-IN-GAS-VM-PROG-T380/50 de Argental",
    accent: "from-blue-500 to-cyan-500",
    driveFolders: [
      "1ED6j5RKCMhhsBn9-JRd1RKhaJKJAWIpw",
      "1fuxxbhU_0__-YtpezDHaSa_6D9C2LEjo",
    ],
    faqs: [
      "¿Por qué debería comprar este equipo?",
      "¿Qué productos puede hacer y cuál es el nivel de producción?",
      "¿Es un equipo seguro?",
      "¿La cocción es pareja y eficiente?",
    ],
    systemPrompt: BASE_PROMPT({ agentId: "DOS-AR", agentName: "HORNO PANIER-III-7090 GN-IN-GAS-VM-PROG-T380/50", primaryFolderLabel: "Info pública" }),
  },
 {
    id: "RAPIFREDDO-15",
    name: "Ultracongelador RAPIFREDDO-V15 45X70",
    family:"Ultracongeladores",
    subfamily:"A definir",
    description: "Especialista en Ultracongelador RAPIFREDDO-V15 45X70 de Argental",
    accent: "from-blue-500 to-cyan-500",
    driveFolders: [
      "1jSj-R6JzmZsllHBNHVaMVh6XDK_Z4ZL0",
      "1fuxxbhU_0__-YtpezDHaSa_6D9C2LEjo",
    ],
    faqs: [
      "¿Por qué debería comprar este equipo?",
      "¿Qué productos puede hacer?",
      "¿Cuál es la capacidad de producción?",
      "¿Mantenimiento requerido?",
    ],
    systemPrompt: BASE_PROMPT({ agentId: "RAPIFREDDO-15", agentName: "Ultracongelador RAPIFREDDO-V15 45X70", primaryFolderLabel: "Info pública" }),
  },
 {
    id: "HCI-500",
    name: "Enfriador de Agua HCI-500 INOX.",
    family:"Enfriador",
    subfamily:"A definir",
    description: "Especialista en Enfriador de Agua HCI-500 INOX. de Argental",
    accent: "from-blue-500 to-cyan-500",
    driveFolders: [
      "1GcydOXAJOxr4JdOYpESZTYvo349d-V_f",
      "1fuxxbhU_0__-YtpezDHaSa_6D9C2LEjo",
    ],
    faqs: [
      "¿Por qué debería comprar este equipo?",
      "¿Qué productos puede hacer?",
      "¿Cuál es la capacidad de producción?",
      "¿Mantenimiento requerido?",
    ],
    systemPrompt: BASE_PROMPT({ agentId: "HCI-500", agentName: "Enfriador de Agua HCI-500 INOX.", primaryFolderLabel: "Info pública" }),
  },

 {
    id: "DBSA",
    name: "Divisora - Bollera Semi. Ambro DBSA30-40-135",
    family:"Divisoras",
    subfamily:"A definir",
    description: "Especialista en Divisora - Bollera Semi. Ambro DBSA30-40-135 de Argental",
    accent: "from-blue-500 to-cyan-500",
    driveFolders: [
      "1ryWuF4ksiL0dxrKUgnDxC3gqIjtKV5k9",
      "1fuxxbhU_0__-YtpezDHaSa_6D9C2LEjo",
    ],
    faqs: [
      "¿Por qué debería comprar este equipo?",
      "¿Qué productos puede hacer?",
      "¿Cuál es la capacidad de producción?",
      "¿Mantenimiento requerido?",
    ],
    systemPrompt: BASE_PROMPT({ agentId: "DBSA", agentName: "Divisora - Bollera Semi. Ambro DBSA30-40-135", primaryFolderLabel: "Info pública" }),
  },

 {
    id: "A-60",
    name: "Batidora Ambro A-60",
    family:"Batidoras",
    subfamily:"A definir",
    description: "Especialista en Batidora Ambro A-60 de Argental",
    accent: "from-blue-500 to-cyan-500",
    driveFolders: [
      "1RYCksOVszec3zSru_Sc-mczbxkYPJIuW",
      "1fuxxbhU_0__-YtpezDHaSa_6D9C2LEjo",
    ],
    faqs: [
      "¿Por qué debería comprar este equipo?",
      "¿Qué productos puede hacer?",
      "¿Cuál es la capacidad de producción?",
      "¿Mantenimiento requerido?",
    ],
    systemPrompt: BASE_PROMPT({ agentId: "A-60", agentName: "Batidora Ambro A-60", primaryFolderLabel: "Info pública" }),
  },
 {
    id: "CFC-40b",
    name: "Cámara de Fermentción Controlada 40b Panier",
    family:"Cámaras de fermentacíón",
    subfamily:"A definir",
    description: "Especialista en Cámara de Fermentción Controlada 40b Panier de Argental",
    accent: "from-blue-500 to-cyan-500",
    driveFolders: [
      "1bwjveMWPeqjikrep_kQXldsDY_hgmyBn",
      "1fuxxbhU_0__-YtpezDHaSa_6D9C2LEjo",
    ],
    faqs: [
      "¿Por qué debería comprar este equipo?",
      "¿Qué productos puede hacer?",
      "¿Cuál es la capacidad de producción?",
      "¿Mantenimiento requerido?",
    ],
    systemPrompt: BASE_PROMPT({ agentId: "CFC-40b", agentName: "Cámara de Fermentción Controlada 40b Panier", primaryFolderLabel: "Info pública" }),
  },
 {
    id: "DB4B",
    name: "Divisora Volumétrica 4B30-200/4B30-200",
    family:"A definir",
    subfamily:"A definir",
    description: "Especialista en Divisora Volumétrica 4B30-200/4B30-200 de Argental",
    accent: "from-blue-500 to-cyan-500",
    driveFolders: [
      "1lxLNVJJDX8IAczfGoB3Z6jBm1LwRJwUC",
      "1fuxxbhU_0__-YtpezDHaSa_6D9C2LEjo",
    ],
    faqs: [
      "¿Por qué debería comprar este equipo?",
      "¿Qué productos puede hacer?",
      "¿Cuál es la capacidad de producción?",
      "¿Mantenimiento requerido?",
    ],
    systemPrompt: BASE_PROMPT({ agentId: "DB4B", agentName: "Divisora Volumétrica 4B30-200/4B30-200", primaryFolderLabel: "Info pública" }),
  },

 {
    id: "DB2B",
    name: "Divisora Volumétrica 2B25-200/4B25-200",
    family:"Divisoras",
    subfamily:"A definir",
    description: "Especialista en Divisora Volumétrica 2B25-200/4B25-200 de Argental",
    accent: "from-blue-500 to-cyan-500",
    driveFolders: [
      "19KeSbv2EuNO0WP2YzQv_yNdx_HJAWlHq",
      "1fuxxbhU_0__-YtpezDHaSa_6D9C2LEjo",
    ],
    faqs: [
      "¿Por qué debería comprar este equipo?",
      "¿Qué productos puede hacer?",
      "¿Cuál es la capacidad de producción?",
      "¿Mantenimiento requerido?",
    ],
    systemPrompt: BASE_PROMPT({ agentId: "DB2B", agentName: "Divisora Volumétrica 2B25-200/4B25-200", primaryFolderLabel: "Info pública" }),
  },

 {
    id: "BPNS-20L",
    name: "BATIDORA BPNS-20L",
    family:"A definir",
    subfamily:"A definir",
    description: "Especialista en BATIDORA BPNS-20L de Argental",
    accent: "from-blue-500 to-cyan-500",
    driveFolders: [
      "1obVahVTZ3fJilHK-Kp4Gsjq9ZHClUQao",
      "1fuxxbhU_0__-YtpezDHaSa_6D9C2LEjo",
    ],
    faqs: [
      "¿Por qué debería comprar este equipo?",
      "¿Qué productos puede hacer?",
      "¿Cuál es la capacidad de producción?",
      "¿Mantenimiento requerido?",
    ],
    systemPrompt: BASE_PROMPT({ agentId: "BPNS-20L", agentName: "BATIDORA BPNS-20L", primaryFolderLabel: "Info pública" }),
  },

 {
    id: "GP-70I-MOD",
    name: "Grissinera Panchera GP70-I",
    family:"Grissinera",
    subfamily:"A definir",
    description: "Especialista en Grissinera Panchera GP70-I de Argental",
    accent: "from-blue-500 to-cyan-500",
    driveFolders: [
      "1jzbqfMErpUJDuxbSVzh4woKPH1gEIyf-",
      "1fuxxbhU_0__-YtpezDHaSa_6D9C2LEjo",
    ],
    faqs: [
      "¿Por qué debería comprar este equipo?",
      "¿Qué productos puede hacer?",
      "¿Cuál es la capacidad de producción?",
      "¿Mantenimiento requerido?",
    ],
    systemPrompt: BASE_PROMPT({ agentId: "GP-70I-MOD", agentName: "Grissinera Panchera GP70-I", primaryFolderLabel: "Info pública" }),
  },

 {
    id: "RAPIFREDDO-30",
    name: "Ultracongelador RAPIFREDDO-30 1C 70X90",
    family:"Ultracongeladores",
    subfamily:"A definir",
    description: "Especialista en Ultracongelador RAPIFREDDO-30 1C 70X90 de Argental",
    accent: "from-blue-500 to-cyan-500",
    driveFolders: [
      "18WdrSvyQK-dR6UJQ26Y47LL6ueM9a9yU",
      "1fuxxbhU_0__-YtpezDHaSa_6D9C2LEjo",
    ],
    faqs: [
      "¿Por qué debería comprar este equipo?",
      "¿Qué productos puede hacer?",
      "¿Cuál es la capacidad de producción?",
      "¿Mantenimiento requerido?",
    ],
    systemPrompt: BASE_PROMPT({ agentId: "RAPIFREDDO-30", agentName: "Ultracongelador RAPIFREDDO-30 1C 70X90", primaryFolderLabel: "Info pública" }),
  },

 {
    id: "BRISEELINE",
    name: "AMBRO - Depositadora BRISEELINE",
    family:"Depositadora",
    subfamily:"A definir",
    description: "Especialista en AMBRO - Depositadora BRISEELINE de Argental",
    accent: "from-blue-500 to-cyan-500",
    driveFolders: [
      "12Ar1-RAwWw5tNAM4S512QLc-d4qkPUQ0",
      "1fuxxbhU_0__-YtpezDHaSa_6D9C2LEjo",
    ],
    faqs: [
      "¿Por qué debería comprar este equipo?",
      "¿Qué productos puede hacer?",
      "¿Cuál es la capacidad de producción?",
      "¿Mantenimiento requerido?",
    ],
    systemPrompt: BASE_PROMPT({ agentId: "BRISEELINE", agentName: "AMBRO - Depositadora BRISEELINE", primaryFolderLabel: "Info pública" }),
  },
 {
    id: "GT-MINI",
    name: "Grupo trinchador GTMINI ARGENTAL",
    family:"Trinchadoras",
    subfamily:"A definir",
    description: "Especialista en Grupo trinchador GTMINI ARGENTAL de Argental",
    accent: "from-blue-500 to-cyan-500",
    driveFolders: [
      "19Wl3FyfIYjgHRNRgZPIUE7e50uCHCFvu",
      "1fuxxbhU_0__-YtpezDHaSa_6D9C2LEjo",
    ],
    faqs: [
      "¿Por qué debería comprar este equipo?",
      "¿Qué productos puede hacer?",
      "¿Cuál es la capacidad de producción?",
      "¿Mantenimiento requerido?",
    ],
    systemPrompt: BASE_PROMPT({ agentId: "GT-MINI", agentName: "Grupo trinchador GTMINI ARGENTAL", primaryFolderLabel: "Info pública" }),
  },
 {
    id: "GT-PANIER",
    name: "Grupo trinchador GT- PANIER",
    family:"A definir",
    subfamily:"A definir",
    description: "Especialista en Grupo trinchador GT- PANIER de Argental",
    accent: "from-blue-500 to-cyan-500",
    driveFolders: [
      "1q9ao1yUwnjnMNMCZXR2jsWlpT_6zfDNG",
      "1fuxxbhU_0__-YtpezDHaSa_6D9C2LEjo",
    ],
    faqs: [
      "¿Por qué debería comprar este equipo?",
      "¿Qué productos puede hacer?",
      "¿Cuál es la capacidad de producción?",
      "¿Mantenimiento requerido?",
    ],
    systemPrompt: BASE_PROMPT({ agentId: "GT-PANIER", agentName: "Grupo trinchador GT- PANIER", primaryFolderLabel: "Info pública" }),
  },
 {
    id: "BPNS-40L",
    name: "BATIDORA BPNS-40L",
    family:"A definir",
    subfamily:"A definir",
    description: "Especialista en BATIDORA BPNS-40L de Argental",
    accent: "from-blue-500 to-cyan-500",
    driveFolders: [
      "19BsrdpNyGesOlAmrLNfrZlPWOLG8EOh8",
      "1fuxxbhU_0__-YtpezDHaSa_6D9C2LEjo",
    ],
    faqs: [
      "¿Por qué debería comprar este equipo?",
      "¿Qué productos puede hacer?",
      "¿Cuál es la capacidad de producción?",
      "¿Mantenimiento requerido?",
    ],
    systemPrompt: BASE_PROMPT({ agentId: "BPNS-40L", agentName: "BATIDORA BPNS-40L", primaryFolderLabel: "Info pública" }),
  },
 {
    id: "DOSIF-RELLENO",
    name: "AMBRO - Dosificador de Rellenos con PEDESTAL / de MESA",
    family:"Dosificador de rellenos",
    subfamily:"A definir",
    description: "Especialista en AMBRO - Dosificador de Rellenos con PEDESTAL / de MESA de Argental",
    accent: "from-blue-500 to-cyan-500",
    driveFolders: [
      "1gvE0zCYeGkpR0Xvy0gVd8z5i7SJnB4g4",
      "1fuxxbhU_0__-YtpezDHaSa_6D9C2LEjo",
    ],
    faqs: [
      "¿Por qué debería comprar este equipo?",
      "¿Qué productos puede hacer?",
      "¿Cuál es la capacidad de producción?",
      "¿Mantenimiento requerido?",
    ],
    systemPrompt: BASE_PROMPT({ agentId: "DOSIF-RELLENO", agentName: "AMBRO - Dosificador de Rellenos con PEDESTAL / de MESA", primaryFolderLabel: "Info pública" }),
  },
 {
    id: "A-160",
    name: "Batidora Ambro A-160",
    family:"Batidoras",
    subfamily:"A definir",
    description: "Especialista en Batidora Ambro A-160 de Argental",
    accent: "from-blue-500 to-cyan-500",
    driveFolders: [
      "1v-d1yIFR1ktXYUhim_7HUk8QnGUg5fKF",
      "1fuxxbhU_0__-YtpezDHaSa_6D9C2LEjo",
    ],
    faqs: [
      "¿Por qué debería comprar este equipo?",
      "¿Qué productos puede hacer?",
      "¿Cuál es la capacidad de producción?",
      "¿Mantenimiento requerido?",
    ],
    systemPrompt: BASE_PROMPT({ agentId: "A-160", agentName: "Batidora Ambro A-160", primaryFolderLabel: "Info pública" }),
  },
 {
    id: "MINI-LINEA-COORD",
    name: "AMBRO - Mesa modular MINI-LINEA con ESTIBADOR COORDINADO",
    family:"Líneas Modulares",
    subfamily:"A definir",
    description: "Especialista en AMBRO - Mesa modular MINI-LINEA con ESTIBADOR COORDINADO de Argental",
    accent: "from-blue-500 to-cyan-500",
    driveFolders: [
      "1LI9HV3mFg9S7-hS2FcMuykz_IjfQEy8i",
      "1fuxxbhU_0__-YtpezDHaSa_6D9C2LEjo",
    ],
    faqs: [
      "¿Por qué debería comprar este equipo?",
      "¿Qué productos puede hacer?",
      "¿Cuál es la capacidad de producción?",
      "¿Mantenimiento requerido?",
    ],
    systemPrompt: BASE_PROMPT({ agentId: "MINI-LINEA-COORD", agentName: "AMBRO - Mesa modular MINI-LINEA con ESTIBADOR COORDINADO", primaryFolderLabel: "Info pública" }),
  },

 {
    id: "MINI-LINEA-RETRAC",
    name: "AMBRO - Mesa modular MINI-LINEA con ESTIBADOR RETRACTIL",
    family:"A definir",
    subfamily:"A definir",
    description: "Especialista en AMBRO - Mesa modular MINI-LINEA con ESTIBADOR RETRACTIL de Argental",
    accent: "from-blue-500 to-cyan-500",
    driveFolders: [
      "1pRYMOYChLdbUr-3VIv178bH9bhf_b3BL",
      "1fuxxbhU_0__-YtpezDHaSa_6D9C2LEjo",
    ],
    faqs: [
      "¿Por qué debería comprar este equipo?",
      "¿Qué productos puede hacer?",
      "¿Cuál es la capacidad de producción?",
      "¿Mantenimiento requerido?",
    ],
    systemPrompt: BASE_PROMPT({ agentId: "MINI-LINEA-RETRAC", agentName: "AMBRO - Mesa modular MINI-LINEA con ESTIBADOR RETRACTIL", primaryFolderLabel: "Info pública" }),
  },
 {
    id: "C12000",
    name: "AMBRO - Elaboradora de Croissants C12000",
    family:"Equipos para croissants",
    subfamily:"A definir",
    description: "Especialista en AMBRO - Elaboradora de Croissants C12000 de Argental",
    accent: "from-blue-500 to-cyan-500",
    driveFolders: [
      "1n46W6083cNjLTDBg8vjaL6aPzZHOJ_Tp",
      "1fuxxbhU_0__-YtpezDHaSa_6D9C2LEjo",
    ],
    faqs: [
      "¿Por qué debería comprar este equipo?",
      "¿Qué productos puede hacer?",
      "¿Cuál es la capacidad de producción?",
      "¿Mantenimiento requerido?",
    ],
    systemPrompt: BASE_PROMPT({ agentId: "C12000", agentName: "AMBRO - Elaboradora de Croissants C12000", primaryFolderLabel: "Info pública" }),
  },
 {
    id: "ARTESAN",
    name: "Divisora Masa Hidratada ARTESAN",
    family:"Divisoras",
    subfamily:"A definir",
    description: "Especialista en Divisora Masa Hidratada ARTESAN de Argental",
    accent: "from-blue-500 to-cyan-500",
    driveFolders: [
      "1s4hFGVp5vCo9-BSA4oM8RRLVZp-jwf4z",
      "1fuxxbhU_0__-YtpezDHaSa_6D9C2LEjo",
    ],
    faqs: [
      "¿Por qué debería comprar este equipo?",
      "¿Qué productos puede hacer?",
      "¿Cuál es la capacidad de producción?",
      "¿Mantenimiento requerido?",
    ],
    systemPrompt: BASE_PROMPT({ agentId: "ARTESAN", agentName: "Divisora Masa Hidratada ARTESAN", primaryFolderLabel: "Info pública" }),
  },
 {
    id: "CHOPRA-III",
    name: "AMBRO - Dosificadora Cortadora CHOPRA III",
    family:"Depositadora",
    subfamily:"A definir",
    description: "Especialista en AMBRO - Dosificadora Cortadora CHOPRA III de Argental",
    accent: "from-blue-500 to-cyan-500",
    driveFolders: [
      "1mURAE25z6ADbLgC4l4FTld-kRKVwDK4N",
      "1fuxxbhU_0__-YtpezDHaSa_6D9C2LEjo",
    ],
    faqs: [
      "¿Por qué debería comprar este equipo?",
      "¿Qué productos puede hacer?",
      "¿Cuál es la capacidad de producción?",
      "¿Mantenimiento requerido?",
    ],
    systemPrompt: BASE_PROMPT({ agentId: "CHOPRA-III", agentName: "AMBRO - Dosificadora Cortadora CHOPRA III", primaryFolderLabel: "Info pública" }),
  },


 {
    id: "LINEA-PIZZAS",
    name: "AMBRO - Línea Pizza 2.0",
    family:"Líneas Modulares",
    subfamily:"A definir",
    description: "Especialista en AMBRO - Línea Pizza 2.0 de Argental",
    accent: "from-blue-500 to-cyan-500",
    driveFolders: [
      "1EDtL9VeqjLawgsQ4gLFsHEPCcuNjoEW-",
      "1fuxxbhU_0__-YtpezDHaSa_6D9C2LEjo",
    ],
    faqs: [
      "¿Por qué debería comprar este equipo?",
      "¿Qué productos puede hacer?",
      "¿Cuál es la capacidad de producción?",
      "¿Mantenimiento requerido?",
    ],
    systemPrompt: BASE_PROMPT({ agentId: "LINEA-PIZZAS", agentName: "AMBRO - Línea Pizza 2.0", primaryFolderLabel: "Info pública" }),
  },
 {
    id: "LINEA-EMPANADAS",
    name: "LINEA EMPANADAS COMPAC",
    family:"A definir",
    subfamily:"A definir",
    description: "Especialista en LINEA EMPANADAS COMPAC de Argental",
    accent: "from-blue-500 to-cyan-500",
    driveFolders: [
      "1TbRwhoi9p2CHe6giK_n71Asi-gV5Gru9",
      "1fuxxbhU_0__-YtpezDHaSa_6D9C2LEjo",
    ],
    faqs: [
      "¿Por qué debería comprar este equipo?",
      "¿Qué productos puede hacer?",
      "¿Cuál es la capacidad de producción?",
      "¿Mantenimiento requerido?",
    ],
    systemPrompt: BASE_PROMPT({ agentId: "LINEA-EMPANADAS", agentName: "LINEA EMPANADAS COMPAC", primaryFolderLabel: "Info pública" }),
  },

  //Amarillos
   {
    id: "M-66",
    name: "CORTADO M66I MODULAR",
    family:"A definir",
    subfamily:"A definir",
    description: "Especialista en CORTADO M66I MODULAR de Argental",
    accent: "from-blue-500 to-cyan-500",
    driveFolders: [
      "1ZfkOWPeCPxrwUxz9KzMt-JL6S9uPk-co",
      "1fuxxbhU_0__-YtpezDHaSa_6D9C2LEjo",
    ],
    faqs: [
      "¿Por qué debería comprar este equipo?",
      "¿Qué productos puede hacer?",
      "¿Cuál es la capacidad de producción?",
      "¿Mantenimiento requerido?",
    ],
    systemPrompt: BASE_PROMPT({ agentId: "M-66", agentName: "CORTADO M66I MODULAR ", primaryFolderLabel: "Info pública" }),
  },
    {
    id: "LPN-520S",
    name: "LAMINADORA DE MESA LPN+520S",
    family:"A definir",
    subfamily:"A definir",
    description: "Especialista en LAMINADORA DE MESA LPN+520S de Argental",
    accent: "from-blue-500 to-cyan-500",
    driveFolders: [
      "1qRG1M9vOYD7jZxZ_q9hZd0YUAdwUYCgd",
      "1fuxxbhU_0__-YtpezDHaSa_6D9C2LEjo",
    ],
    faqs: [
      "¿Por qué debería comprar este equipo?",
      "¿Qué productos puede hacer?",
      "¿Cuál es la capacidad de producción?",
      "¿Mantenimiento requerido?",
    ],
    systemPrompt: BASE_PROMPT({ agentId: "LPN-520S", agentName: "LAMINADORA DE MESA LPN+520S ", primaryFolderLabel: "Info pública" }),
  },
    {
    id: "LIDO",
    name: "HORNO ROTATIVO LIDO 960",
    family:"A definir",
    subfamily:"A definir",
    description: "Especialista en HORNO ROTATIVO LIDO 960 de Argental",
    accent: "from-blue-500 to-cyan-500",
    driveFolders: [
      "1jO_BnQKAOHg7w3hY5QdfTIk_0PevOxW7",
      "1fuxxbhU_0__-YtpezDHaSa_6D9C2LEjo",
    ],
    faqs: [
      "¿Por qué debería comprar este equipo?",
      "¿Qué productos puede hacer?",
      "¿Cuál es la capacidad de producción?",
      "¿Mantenimiento requerido?",
    ],
    systemPrompt: BASE_PROMPT({ agentId: "LIDO", agentName: "HORNO ROTATIVO LIDO 960", primaryFolderLabel: "Info pública" }),
  },
    {
    id: "SPNI-500",
    name: "SOBADORA PASTELERA SPNI-500",
    family:"A definir",
    subfamily:"A definir",
    description: "Especialista en SOBADORA PASTELERA SPNI-500 de Argental",
    accent: "from-blue-500 to-cyan-500",
    driveFolders: [
      "1W97MfMFsgKY-TwfR9DKaaKlO5ew9Ymvk",
      "1fuxxbhU_0__-YtpezDHaSa_6D9C2LEjo",
    ],
    faqs: [
      "¿Por qué debería comprar este equipo?",
      "¿Qué productos puede hacer?",
      "¿Cuál es la capacidad de producción?",
      "¿Mantenimiento requerido?",
    ],
    systemPrompt: BASE_PROMPT({ agentId: "SPNI-500", agentName: "SOBADORA PASTELERA SPNI-500", primaryFolderLabel: "Info pública" }),
  },
    {
    id: "BC1200I",
    name: "Bollera Cónica BC1200I",
    family:"Bolleras",
    subfamily:"A definir",
    description: "Especialista en Bollera Cónica BC1200I de Argental",
    accent: "from-blue-500 to-cyan-500",
    driveFolders: [
      "1kfD_1jJoekSkGfElAtyTkYyg7SHzd7vo",
      "1fuxxbhU_0__-YtpezDHaSa_6D9C2LEjo",
    ],
    faqs: [
      "¿Por qué debería comprar este equipo?",
      "¿Qué productos puede hacer?",
      "¿Cuál es la capacidad de producción?",
      "¿Mantenimiento requerido?",
    ],
    systemPrompt: BASE_PROMPT({ agentId: "BC1200I", agentName: "Bollera Cónica BC1200I", primaryFolderLabel: "Info pública" }),
  },
    {
    id: "ARD6I-MOD",
    name: "ARMADORA MODULAR ARD6-I MOD",
    family:"A definir",
    subfamily:"A definir",
    description: "Especialista en ARMADORA MODULAR ARD6-I MOD de Argental",
    accent: "from-blue-500 to-cyan-500",
    driveFolders: [
      "1wQb5BfZukePo38MUAXUvREhWHM9MZk0D",
      "1fuxxbhU_0__-YtpezDHaSa_6D9C2LEjo",
    ],
    faqs: [
      "¿Por qué debería comprar este equipo?",
      "¿Qué productos puede hacer?",
      "¿Cuál es la capacidad de producción?",
      "¿Mantenimiento requerido?",
    ],
    systemPrompt: BASE_PROMPT({ agentId: "ARD6I-MOD", agentName: "ARMADORA MODULAR ARD6-I MOD", primaryFolderLabel: "Info pública" }),
  },
    {
    id: "FDPM",
    name: "Formadora de pizzas FDP",
    family:"Formador de Pizza",
    subfamily:"A definir",
    description: "Especialista en Formadora de pizzas FDP de Argental",
    accent: "from-blue-500 to-cyan-500",
    driveFolders: [
      "1-P3S8oBUQc7gmkAwH5m-yzp4qCgXOf1l",
      "1fuxxbhU_0__-YtpezDHaSa_6D9C2LEjo",
    ],
    faqs: [
      "¿Por qué debería comprar este equipo?",
      "¿Qué productos puede hacer?",
      "¿Cuál es la capacidad de producción?",
      "¿Mantenimiento requerido?",
    ],
    systemPrompt: BASE_PROMPT({ agentId: "FDPM", agentName: "Formadora de pizzas FDP", primaryFolderLabel: "Info pública" }),
  },
    {
    id: "DB1200",
    name: "DIVISORA VOLUMÉTRICA DE MASA DB1200",
    family:"A definir",
    subfamily:"A definir",
    description: "Especialista en DIVISORA VOLUMÉTRICA DE MASA DB1200 de Argental",
    accent: "from-blue-500 to-cyan-500",
    driveFolders: [
      "19qMp1Dmp8XEU0QzaaOyl5apEDyJMqRc-",
      "1fuxxbhU_0__-YtpezDHaSa_6D9C2LEjo",
    ],
    faqs: [
      "¿Por qué debería comprar este equipo?",
      "¿Qué productos puede hacer?",
      "¿Cuál es la capacidad de producción?",
      "¿Mantenimiento requerido?",
    ],
    systemPrompt: BASE_PROMPT({ agentId: "DB1200", agentName: "DIVISORA VOLUMÉTRICA DE MASA DB1200", primaryFolderLabel: "Info pública" }),
  },
    {
    id: "TRANSP-BARRAS",
    name: "TRANSPORTADOR DE BARRAS",
    family:"A definir",
    subfamily:"A definir",
    description: "Especialista en TRANSPORTADOR DE BARRAS de Argental",
    accent: "from-blue-500 to-cyan-500",
    driveFolders: [
      "1yPOmwz_NYHvlt1ymyyZcV7-0d6ssgYQT",
      "1fuxxbhU_0__-YtpezDHaSa_6D9C2LEjo",
    ],
    faqs: [
      "¿Por qué debería comprar este equipo?",
      "¿Qué productos puede hacer?",
      "¿Cuál es la capacidad de producción?",
      "¿Mantenimiento requerido?",
    ],
    systemPrompt: BASE_PROMPT({ agentId: "TRANSP-BARRAS", agentName: "TRANSPORTADOR DE BARRAS", primaryFolderLabel: "Info pública" }),
  },
    {
    id: "INSIGNIA",
    name: "ARGENTAL - INSIGNIA",
    family:"Sistemas de panificación",
    subfamily:"A definir",
    description: "Especialista en ARGENTAL - INSIGNIA de Argental",
    accent: "from-blue-500 to-cyan-500",
    driveFolders: [
      "1i-IFrDpjrcXF9Xy2cGuCnVEDT48sFK_y",
      "1fuxxbhU_0__-YtpezDHaSa_6D9C2LEjo",
    ],
    faqs: [
      "¿Por qué debería comprar este equipo?",
      "¿Qué productos puede hacer?",
      "¿Cuál es la capacidad de producción?",
      "¿Mantenimiento requerido?",
    ],
    systemPrompt: BASE_PROMPT({ agentId: "INSIGNIA", agentName: "ARGENTAL - INSIGNIA", primaryFolderLabel: "Info pública" }),
  },
   {
    id: "AMBRO-PRESS",
    name: "AMBRO - Prensagrasa AmbroPress",
    family:"Prensagrasa",
    subfamily:"A definir",
    description: "Especialista en AMBRO - Prensagrasa AmbroPress de Argental",
    accent: "from-blue-500 to-cyan-500",
    driveFolders: [
      "1D0w02OHj-mhihW-qSURQEQUA7vrskAP1",
      "1fuxxbhU_0__-YtpezDHaSa_6D9C2LEjo",
    ],
    faqs: [
      "¿Por qué debería comprar este equipo?",
      "¿Qué productos puede hacer?",
      "¿Cuál es la capacidad de producción?",
      "¿Mantenimiento requerido?",
    ],
    systemPrompt: BASE_PROMPT({ agentId: "AMBRO-PRESS", agentName: "AMBRO - Prensagrasa AmbroPress", primaryFolderLabel: "Info pública" }),
  },
   {
    id: "RPNM-RPN",
    name: "REBANADORA RPNM PANIER",
    family:"A definir",
    subfamily:"A definir",
    description: "Especialista en REBANADORA RPNM PANIER de Argental",
    accent: "from-blue-500 to-cyan-500",
    driveFolders: [
      "13xJQYsx9VesiIKNMEy96CMgPGQoZ1B0T",
      "1fuxxbhU_0__-YtpezDHaSa_6D9C2LEjo",
    ],
    faqs: [
      "¿Por qué debería comprar este equipo?",
      "¿Qué productos puede hacer?",
      "¿Cuál es la capacidad de producción?",
      "¿Mantenimiento requerido?",
    ],
    systemPrompt: BASE_PROMPT({ agentId: "RPNM-RPN", agentName: "REBANADORA RPNM PANIER", primaryFolderLabel: "Info pública" }),
  },
   {
    id: "FMI-10-12",
    name: "FORMADORA DE MASA FMI-10",
    family:"A definir",
    subfamily:"A definir",
    description: "Especialista en FORMADORA DE MASA FMI-10 de Argental",
    accent: "from-blue-500 to-cyan-500",
    driveFolders: [
      "1zyclXEs6T2lzNSgWMVvs4xIhaNo9cwPD",
      "1fuxxbhU_0__-YtpezDHaSa_6D9C2LEjo",
    ],
    faqs: [
      "¿Por qué debería comprar este equipo?",
      "¿Qué productos puede hacer?",
      "¿Cuál es la capacidad de producción?",
      "¿Mantenimiento requerido?",
    ],
    systemPrompt: BASE_PROMPT({ agentId: "FMI-10-12", agentName: "FORMADORA DE MASA FMI-10", primaryFolderLabel: "Info pública" }),
  },
   {
    id: "BPNV-300",
    name: "BIZCOMATICA BPNV-300 PANIER",
    family:"A definir",
    subfamily:"A definir",
    description: "Especialista en BIZCOMATICA BPNV-300 PANIER de Argental",
    accent: "from-blue-500 to-cyan-500",
    driveFolders: [
      "1DLxmdfeMXZgmm3gV0xWXtonfw4GGN0EY",
      "1fuxxbhU_0__-YtpezDHaSa_6D9C2LEjo",
    ],
    faqs: [
      "¿Por qué debería comprar este equipo?",
      "¿Qué productos puede hacer?",
      "¿Cuál es la capacidad de producción?",
      "¿Mantenimiento requerido?",
    ],
    systemPrompt: BASE_PROMPT({ agentId: "BPNV-300", agentName: "BIZCOMATICA BPNV-300 PANIER", primaryFolderLabel: "Info pública" }),
  },
  {
    id: "MP-1I",
    name: "MOLINO RALLADOR MP-1I PANIER",
    family:"A definir",
    subfamily:"A definir",
    description: "Especialista en MOLINO RALLADOR MP-1I PANIER de Argental",
    accent: "from-blue-500 to-cyan-500",
    driveFolders: [
      "1bOeZ6yCr5KFgylwe9M52oGTrMzLTy7ce",
      "1fuxxbhU_0__-YtpezDHaSa_6D9C2LEjo",
    ],
    faqs: [
      "¿Por qué debería comprar este equipo?",
      "¿Qué productos puede hacer?",
      "¿Cuál es la capacidad de producción?",
      "¿Mantenimiento requerido?",
    ],
    systemPrompt: BASE_PROMPT({ agentId: "MP-1I", agentName: "MOLINO RALLADOR MP-1I PANIER ", primaryFolderLabel: "Info pública" }),
  },
  {
    id: "DPN-2232",
    name: "DESCORTEZADORA DPN-2232 PANIER",
    family:"A definir",
    subfamily:"A definir",
    description: "Especialista en DESCORTEZADORA DPN-2232 PANIER de Argental",
    accent: "from-blue-500 to-cyan-500",
    driveFolders: [
      "1Muq-5v8pMpJsK_GoPMJDlSE3ZCsTkdRi",
      "1fuxxbhU_0__-YtpezDHaSa_6D9C2LEjo",
    ],
    faqs: [
      "¿Por qué debería comprar este equipo?",
      "¿Qué productos puede hacer?",
      "¿Cuál es la capacidad de producción?",
      "¿Mantenimiento requerido?",
    ],
    systemPrompt: BASE_PROMPT({ agentId: "DPN-2232", agentName: "DESCORTEZADORA DPN-2232 PANIER ", primaryFolderLabel: "Info pública" }),
  },
  {
    id: "MIX-60",
    name: "Batidora Argental MIX-60",
    family:"Batidoras",
    subfamily:"A definir",
    description: "Especialista en Batidora Argental MIX-60 de Argental",
    accent: "from-blue-500 to-cyan-500",
    driveFolders: [
      "1DLoeMiW3MBpSlCG7fDpXTu7xuFgyQU60",
      "1fuxxbhU_0__-YtpezDHaSa_6D9C2LEjo",
    ],
    faqs: [
      "¿Por qué debería comprar este equipo?",
      "¿Qué productos puede hacer?",
      "¿Cuál es la capacidad de producción?",
      "¿Mantenimiento requerido?",
    ],
    systemPrompt: BASE_PROMPT({ agentId: "MIX-60", agentName: "Batidora Argental MIX-60 ", primaryFolderLabel: "Info pública" }),
  },
  {
    id: "BHC",
    name: "Bollera Horizontal BHC",
    family:"Bolleras",
    subfamily:"A definir",
    description: "Especialista en Bollera Horizontal BHC de Argental",
    accent: "from-blue-500 to-cyan-500",
    driveFolders: [
      "1bbpynBtFh6e6I7WVGzKoUZRME5I_B0mZ",
      "1fuxxbhU_0__-YtpezDHaSa_6D9C2LEjo",
    ],
    faqs: [
      "¿Por qué debería comprar este equipo?",
      "¿Qué productos puede hacer?",
      "¿Cuál es la capacidad de producción?",
      "¿Mantenimiento requerido?",
    ],
    systemPrompt: BASE_PROMPT({ agentId: "BHC", agentName: "Bollera Horizontal BHC ", primaryFolderLabel: "Info pública" }),
  },
  {
    id: "M-6130-17CORTE",
    name: "AMBRO - Laminadora M-600 con estación de corte",
    family:"Laminadoras",
    subfamily:"A definir",
    description: "Especialista en AMBRO - Laminadora M-600 con estación de corte de Argental",
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
    systemPrompt: BASE_PROMPT({ agentId: "M-6130-17CORTE", agentName: "AMBRO - Laminadora M-600 con estación de corte ", primaryFolderLabel: "Info pública" }),
  },
  

]; 

export function getAgentById(id: string) {
  return AGENTS.find(a => a.id === id);
}