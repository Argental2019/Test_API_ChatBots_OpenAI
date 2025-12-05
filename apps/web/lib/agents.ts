// apps/web/lib/agents.ts
export type ChatMessage = { role: "user" | "assistant"; content: string; ts?: number };

export type Agent = {
  id: string;         // único, ej: "fe960"
  name: string;
  family: string;
  subfamily: string;
  description: string;
  accent: string;           // gradiente UI
  driveFolders: string[];   // IDs exactos de Drive
  faqs: string[];
  systemPrompt: string;
       // se genera desde plantilla
};

// ===================== BASE PROMPT =====================
// ===================== BASE PROMPT =====================
const BASE_PROMPT = ({
  agentId,
  agentName,
  primaryFolderLabel = "Info pública",
  adminMode = false,
}: {
  agentId: string;
  agentName: string;
  primaryFolderLabel?: string;
  adminMode?: boolean;
}) => `
# 🧠 Instrucciones del Agente: ${agentId}

### 🎯 Rol del agente
Sos **Asesor Público ${agentId}**, un agente especializado **exclusivamente** en ${agentName} de panadería
industrial fabricado por **Argental**.
Tu única función es asistir a usuarios externos brindando **respuestas claras, técnicas y verificables**,
basadas **solo** en la documentación oficial de Argental almacenada en Google Drive (contexto provisto por el sistema).

🔒 **Restricciones fuertes**
- **NO** usás conocimiento general, memoria previa ni internet.
- **NO** respondés con datos históricos, estadísticas, precios, ni opiniones que no estén **explícitamente** en la documentación.
- Si la información no está claramente en el contexto, **no podés inventarla ni “aproximarla”**.

### 🚫 Prohibido completar sin respaldo

Siempre verificá si la pregunta del usuario está bien soportada por el contexto documental:

- Si te piden **datos históricos, volúmenes de producción, consumos o estadísticas generales**  
  (ej.: “¿cuántos panes se fabricaban en 1950?”, “¿cuánto se vende en Argentina?”, etc.)  
  y eso **no aparece textualmente** en la documentación → se considera **SIN RESPALDO**.
- Si lo único que podrías contestar son **frases genéricas o de cortesía**  
  (ej.: “¡Gracias por tus consultas! Si necesitás algo más …”),  
  sin ningún dato técnico concreto → también se considera **SIN RESPALDO**.
- No uses esos textos genéricos como respuesta principal cuando no tengas datos técnicos.

En **todos esos casos** debés seguir el flujo **@@MISS** detallado más abajo.

### ✅ Comportamiento cuando SÍ hay información
Cuando la documentación sí cubre la consulta del usuario:

- Respondé siempre:
  - con lenguaje claro y profesional,
  - con foco en **características, usos, capacidades, instalación, mantenimiento, seguridad, repuestos**, etc.
- Podés usar brevemente frases de cortesía **solo como cierre**, pero
  **siempre acompañadas de contenido técnico derivado de la documentación.**

${
  adminMode
    ? `
🔐 ADMIN MODE (activo)
- Podés incluir metadatos internos siguiendo el formato indicado por el sistema usando @@META.
`
    : `
🔒 MODO PÚBLICO
- Prohibido mencionar nombres/IDs de carpetas o archivos de Drive, rutas internas o información sensible.
`
}

## 🧾 Registro de preguntas sin respaldo (@@MISS)

Si **NO** podés responder con la documentación disponible (porque la info no aparece, es demasiado general
o solo tenés textos genéricos de cierre), debés hacer lo siguiente:

1. En la **primera línea** devolvé EXACTAMENTE:

@@MISS {"reason":"sin_fuente","query":"<pregunta_usuario>","need":"<qué falta>"}

2. En las líneas siguientes, explicá al usuario en lenguaje claro por qué no podés responder
   y qué tipo de información faltaría en la documentación.

- Usá @@MISS **solo** cuando realmente no tenés respaldo documental.
- Cuando uses @@MISS, **no** agregues @@META.
- @@MISS y @@META son mutuamente excluyentes: usá uno u otro, nunca ambos.

`.trim();

// ===================== 1) PEGÁ ACÁ TU CSV =====================
// Importante: la primera fila debe contener estos encabezados exactos:
// COD_LISPRE,Categoría,SubCategoría,Nombre Comercial del Producto,Preg1,Preg2,Preg3,Preg4,Preg5
const RAW_CSV = `
COD_LISPRE,Categoría,SubCategoría,Nombre Comercial del Producto,Preg1,Preg2,Preg3,Preg4,Preg5
FE960,Horno,Horno Rotativo 70x90,FE4.0 960,¿Por qué debería comprar este equipo?,¿Qué productos puede hacer y con qué nivel de producción?,¿Es un equipo seguro?,¿La cocción es pareja y eficiente?,¿Cuáles son las dimensiones del equipo?
GALILEO,Sistema Automático,Sistema de Panificacion,Galileo Pan Frances / Pan de Molde,¿Por qué debería comprar este equipo?,¿Qué productos puede hacer y con qué nivel de producción?,¿Cómo es la calidad respecto al pan sobado?,¿Mantenimiento requerido?,¿Cuáles son las dimensiones del equipo?
MBE-80U-S,Máquina,Amasadora Rapida Espiral,MBE-80S,¿Por qué debería comprar este equipo?,¿Qué productos puede hacer?,¿Cuál es la capacidad de producción?,¿Mantenimiento requerido?,¿Cuáles son las dimensiones del equipo?
MBE-200U-S,Máquina,Amasadora Rapida Espiral,MBE-200S,¿Por qué debería comprar este equipo?,¿Qué productos puede hacer?,¿Cuál es la capacidad de producción?,¿Mantenimiento requerido?,¿Cuáles son las dimensiones del equipo?
PA340,Horno,Horno Rotativo 45x70,Panier III 45x70,¿Por qué debería comprar este equipo?,¿Qué productos puede hacer y con qué nivel de producción?,¿Es un equipo seguro?,¿La cocción es pareja y eficiente?,¿Cuáles son las dimensiones del equipo?
C4000-19,Máquina,Medialunera / Croissants,C-4000,¿Por qué debería comprar este equipo?,¿Qué productos puede hacer?,¿Cuál es la capacidad de producción?,¿Mantenimiento requerido?,¿Cuáles son las dimensiones del equipo?
M-6130-17,Máquina,Laminadora,Refinadora M-600,¿Por qué debería comprar este equipo?,¿Qué productos puede hacer y con qué nivel de producción?,¿Es un equipo seguro?,¿Mantenimiento requerido?,¿Cuáles son las dimensiones del equipo?
TORNADO-PL,Máquina,Mesa de Corte,Tonado Plus E,¿Por qué debería comprar este equipo?,¿Qué productos puede hacer?,¿Cuál es la capacidad de producción?,¿Mantenimiento requerido?,¿Cuáles son las dimensiones del equipo?
BLIND-LI-FULL,Máquina,Sobadora Pesada,Blindi full,¿Por qué debería comprar este equipo?,¿Qué productos puede hacer?,¿Cuál es la capacidad de producción?,¿Mantenimiento requerido?,¿Cuáles son las dimensiones del equipo?
GALILEO-ARTESAN,Sistema Automático,Sistema de Panificacion,Galileo Artesano,¿Por qué debería comprar este equipo?,¿Qué productos puede hacer y con qué nivel de producción?,¿Cómo es la calidad respecto al pan sobado?,¿Mantenimiento requerido?,¿Cuáles son las dimensiones del equipo?
COMPRESSLINE,Máquina Semi Industrial,Mesa de Corte ,Compressline,¿Por qué debería comprar este equipo?,¿Qué productos puede hacer?,¿Cuál es la capacidad de producción?,¿Mantenimiento requerido?,¿Cuáles son las dimensiones del equipo?
LINEA-CIABATTA,Máquina Semi Industrial,Mesa de Corte ,Ciabattera,¿Por qué debería comprar este equipo?,¿Qué productos puede hacer?,¿Cuál es la capacidad de producción?,¿Mantenimiento requerido?,¿Cuáles son las dimensiones del equipo?
FOGLIA,Máquina,Laminadora Automatica,Foglia,¿Por qué debería comprar este equipo?,¿Qué productos puede hacer y con qué nivel de producción?,¿Es un equipo seguro?,¿Mantenimiento requerido?,¿Cuáles son las dimensiones del equipo?
TORNADO-PL-II,Máquina,Mesa de Corte y Estibado,Tornado Plus E II,¿Por qué debería comprar este equipo?,¿Qué productos puede hacer?,¿Es un equipo seguro?,¿Mantenimiento requerido?,¿Cuáles son las dimensiones del equipo?
GT-38,Máquina,Trinchadora,GT38-I,¿Por qué debería comprar este equipo?,¿Qué productos puede hacer?,¿Cuál es la capacidad de producción?,¿Mantenimiento requerido?,¿Cuáles son las dimensiones del equipo?
FE-III-315-ROTATIVO,Horno,Horno Rotativo 10 45x70 / 40x60,FE III 315,¿Por qué debería comprar este equipo?,¿Qué productos puede hacer y con qué nivel de producción?,¿La cocción es pareja y eficiente?,¿Es un equipo seguro?,¿Cuáles son las dimensiones del equipo?
360-BE,Máquina,Sobadora Semi Automatica,SA 360 BE,¿Por qué debería comprar este equipo?,¿Qué productos puede hacer y con qué nivel de producción?,¿Es un equipo seguro?,¿Mantenimiento requerido?,¿Cuáles son las dimensiones del equipo?
CORBOLI,Máquina,Cortadora y Bollera,Corboli,¿Por qué debería comprar este equipo?,¿Qué productos puede hacer?,¿Cuál es la capacidad de producción?,¿Mantenimiento requerido?,¿Cuáles son las dimensiones del equipo?
MBE-160HA,Máquina,Amasadora Rapida Espiral,MBE-160HA,¿Por qué debería comprar este equipo?,¿Qué productos puede hacer?,¿Cuál es la capacidad de producción?,¿Mantenimiento requerido?,¿Cuáles son las dimensiones del equipo?
DB,Máquina,Divisora Volumetrica,DB 1000,¿Por qué debería comprar este equipo?,¿Qué productos puede hacer?,¿Cuál es la capacidad de producción?,¿Mantenimiento requerido?,¿Cuáles son las dimensiones del equipo?
FE4-0-472,Horno,Horno Rotativo 45x70,FE4.0 472,¿Por qué debería comprar este equipo?,¿Qué productos puede hacer y con qué nivel de producción?,¿Es un equipo seguro?,¿La cocción es pareja y eficiente?,¿Cuáles son las dimensiones del equipo?
FE-BIO-472,Horno,Horno Rotativo 45x70 BIO,FE4.0 472 BIO,¿Por qué debería comprar este equipo?,¿Qué productos puede hacer y con qué nivel de producción?,¿La cocción es pareja y eficiente?,¿Mantenimiento requerido?,¿Cuáles son las dimensiones del equipo?
FE-BIO-960,Horno,Horno Rotativo 70x90 BIO,FE4.0 960 BIO,¿Por qué deberia comprar este equipo?,¿Qué productos puede hacer?,¿Cuál es la capacidad de produccion?,¿Mantenimiento requerido?,¿Cuáles son las dimensiones del equipo?
ARM-4000,Máquina,Formadora de Medialunas / Croissants,Cabezal Armador 4000,¿Por qué debería comprar este equipo?,¿Qué productos puede hacer?,¿Cuál es la capacidad de producción?,¿Mantenimiento requerido?,¿Cuáles son las dimensiones del equipo?
RAPIFREDDO-T5,Máquina,Ultracongelador 2/3/4/5 Carros 70x90,Rapifreddo T2 / T3 / T4 / T5,¿Por qué debería comprar este equipo?,¿Qué productos puede hacer?,¿Cuál es la capacidad de producción?,¿Mantenimiento requerido?,¿Cuáles son las dimensiones del equipo?
GTC-MODULAR,Máquina,Trinchadora,GTC-I,¿Por qué debería comprar este equipo?,¿Qué productos puede hacer?,¿Cuál es la capacidad de producción?,¿Mantenimiento requerido?,¿Cuáles son las dimensiones del equipo?
GTCG,Trinchadoras,A definir,,¿Por qué debería comprar este equipo?,¿Qué productos puede hacer?,¿Cuál es la capacidad de producción?,¿Mantenimiento requerido?,¿Cuáles son las dimensiones del equipo?
H2C,Horno,Horno de Piso,H2C,¿Por qué debería comprar este equipo?,¿Qué productos puede hacer?,¿Cuál es la capacidad de producción?,¿Mantenimiento requerido?,¿Cuáles son las dimensiones del equipo?
DBS,Máquina,Divisora Bollera ,DBS 30-100-30,¿Por qué debería comprar este equipo?,¿Qué productos puede hacer?,¿Cuál es la capacidad de producción?,¿Mantenimiento requerido?,¿Cuáles son las dimensiones del equipo?
CFA,Cámara de Fermentación,Camara de Fermentacion 2/4/6 Carros 70x90,CFA 2 / 4 / 6 carros 70x90,¿Por qué debería comprar este equipo?,¿Qué productos puede hacer?,¿Cuál es la capacidad de producción?,¿Mantenimiento requerido?,¿Cuáles son las dimensiones del equipo?
EU2C-MODULAR,Máquina,Cortadora y Armadora,EU2C-I,¿Por qué debería comprar este equipo?,¿Qué productos puede hacer?,¿Cuál es la capacidad de producción?,¿Mantenimiento requerido?,¿Cuáles son las dimensiones del equipo?
ELEVA,Máquina,Elevador de Bateas ,ELEVA T160H,¿Por qué debería comprar este equipo?,¿Qué productos puede hacer?,¿Cuál es la capacidad de producción?,¿Mantenimiento requerido?,¿Cuáles son las dimensiones del equipo?
MBE-40T,Máquina,Amasadora Rapida Espiral,MBE-40T,¿Por qué debería comprar este equipo?,¿Qué productos puede hacer?,¿Cuál es la capacidad de producción?,¿Mantenimiento requerido?,¿Cuáles son las dimensiones del equipo?
SGAU-MODULAR,Máquina,Trinchadora Estibadora ,SGAUI 7090 / 6080,¿Por qué debería comprar este equipo?,¿Qué productos puede hacer?,¿Cuál es la capacidad de producción?,¿Mantenimiento requerido?,¿Cuáles son las dimensiones del equipo?
SGGPM,Trinchadoras,A definir,,¿Por qué debería comprar este equipo?,¿Qué productos puede hacer?,¿Cuál es la capacidad de producción?,¿Mantenimiento requerido?,¿Cuáles son las dimensiones del equipo?
SGAUG,Trinchadoras,A definir,,¿Por qué debería comprar este equipo?,¿Qué productos puede hacer?,¿Cuál es la capacidad de producción?,¿Mantenimiento requerido?,¿Cuáles son las dimensiones del equipo?
SP-MODULAR,Trinchadoras,A definir,,¿Por qué debería comprar este equipo?,¿Qué productos puede hacer?,¿Cuál es la capacidad de producción?,¿Mantenimiento requerido?,¿Cuáles son las dimensiones del equipo?
HORECA,Horno,Horno Rapido,Horeca BL,¿Por qué debería comprar este equipo?,¿Qué productos puede hacer?,¿Cuál es la capacidad de producción?,¿Mantenimiento requerido?,¿Cuáles son las dimensiones del equipo?
NATO,Horno,Horno Convector,NATO,¿Por qué debería comprar este equipo?,¿Qué productos puede hacer?,¿Cuál es la capacidad de producción?,¿Mantenimiento requerido?,¿Cuáles son las dimensiones del equipo?
MINICONV,Horno,Horno Convector,MINICONV,¿Por qué debería comprar este equipo?,¿Qué productos puede hacer?,¿Cuál es la capacidad de producción?,¿Mantenimiento requerido?,¿Cuáles son las dimensiones del equipo?
DOS-AR,Máquina,Dosificadora de Agua,Dos-Ar,¿Por qué debería comprar este equipo?,¿Cuáles son las dimensiones del equipo?,¿Cuál es la capacidad de producción?,¿Mantenimiento requerido?,¿Cuáles son las dimensiones del equipo?
PA390,Horno,Horno Rotativo 70x90,Panier III 7090,¿Por qué debería comprar este equipo?,¿Qué productos puede hacer y cuál es el nivel de producción?,¿Es un equipo seguro?,¿La cocción es pareja y eficiente?,¿Cuáles son las dimensiones del equipo?
RAPIFREDDO-15,Máquina,Ultracongelador 15 bandejas,Rapifreddo V-15,¿Por qué debería comprar este equipo?,¿Qué productos puede hacer?,¿Cuál es la capacidad de producción?,¿Mantenimiento requerido?,¿Cuáles son las dimensiones del equipo?
HCI-500,Máquina,Enfriador de Agua,HCI-500,¿Por qué debería comprar este equipo?,¿Cuál es la capacidad de producción?,¿Cuál es la capacidad de producción?,¿Mantenimiento requerido?,¿Cuáles son las dimensiones del equipo?
DBSA,Máquina,Divisora Bollera   ,DBSA 30-40-135,¿Por qué debería comprar este equipo?,¿Qué productos puede hacer?,¿Cuál es la capacidad de producción?,¿Mantenimiento requerido?,¿Cuáles son las dimensiones del equipo?
A-60,Máquina,Batidora Planetaria,A-60,¿Por qué debería comprar este equipo?,¿Qué productos puede hacer?,¿Cuál es la capacidad de producción?,¿Mantenimiento requerido?,¿Cuáles son las dimensiones del equipo?
CFC-40b,Cámara de Fermentación,Camara de Fermentacion Controlada 40B,CFC 40B Panier,¿Por qué debería comprar este equipo?,¿Qué productos puede hacer?,¿Cuál es la capacidad de producción?,¿Mantenimiento requerido?,¿Cuáles son las dimensiones del equipo?
DB4B,Máquina,Divisora Volumetrica,DB-4 Bocas,¿Por qué debería comprar este equipo?,¿Qué productos puede hacer?,¿Cuál es la capacidad de producción?,¿Mantenimiento requerido?,¿Cuáles son las dimensiones del equipo?
DB2B,Máquina,Divisora Volumetrica,DB-2 Bocas,¿Por qué debería comprar este equipo?,¿Qué productos puede hacer?,¿Cuál es la capacidad de producción?,¿Mantenimiento requerido?,¿Cuáles son las dimensiones del equipo?
BPNS-20L,Máquina,Batidora Planetaria,BPNS-20L,¿Por qué debería comprar este equipo?,¿Qué productos puede hacer?,¿Cuál es la capacidad de producción?,¿Mantenimiento requerido?,¿Cuáles son las dimensiones del equipo?
GP-70I-MOD,Máquina,Grissinera - Panchera,GP70-I,¿Por qué debería comprar este equipo?,¿Qué productos puede hacer?,¿Cuál es la capacidad de producción?,¿Mantenimiento requerido?,¿Cuáles son las dimensiones del equipo?
RAPIFREDDO-30,Máquina,Ultracongelador 1 carro 70x90,Rapifreddo T-30,¿Por qué debería comprar este equipo?,¿Qué productos puede hacer?,¿Cuál es la capacidad de producción?,¿Mantenimiento requerido?,¿Cuáles son las dimensiones del equipo?
BRISEELINE,Máquina,Depositadora,Briseeline,¿Por qué debería comprar este equipo?,¿Qué productos puede hacer?,¿Cuál es la capacidad de producción?,¿Mantenimiento requerido?,¿Cuáles son las dimensiones del equipo?
GT-MINI,Máquina,Trinchadora,GT-Mini,¿Por qué debería comprar este equipo?,¿Qué productos puede hacer?,¿Cuál es la capacidad de producción?,¿Mantenimiento requerido?,¿Cuáles son las dimensiones del equipo?
GT-PANIER,Máquina,Trinchadora,GT-Panier,¿Por qué debería comprar este equipo?,¿Qué productos puede hacer?,¿Cuál es la capacidad de producción?,¿Mantenimiento requerido?,¿Cuáles son las dimensiones del equipo?
BPNS-40L,Máquina,Batidora Planetaria,BPNS-40L,¿Por qué debería comprar este equipo?,¿Qué productos puede hacer?,¿Cuál es la capacidad de producción?,¿Mantenimiento requerido?,¿Cuáles son las dimensiones del equipo?
DOSIF-RELLENO,Máquina,Dosificadora,Dosificador de Rellenos,¿Por qué debería comprar este equipo?,¿Qué productos puede hacer?,¿Cuál es la capacidad de producción?,¿Mantenimiento requerido?,¿Cuáles son las dimensiones del equipo?
A-160,Máquina,Batidora Planetaria,A-160,¿Por qué debería comprar este equipo?,¿Qué productos puede hacer?,¿Cuál es la capacidad de producción?,¿Mantenimiento requerido?,¿Cuáles son las dimensiones del equipo?
MINI-LINEA-COORD,Máquina Semi Industrial,Mesa de Corte,Mini-Linea con E/C,¿Por qué debería comprar este equipo?,¿Qué productos puede hacer?,¿Cuál es la capacidad de producción?,¿Mantenimiento requerido?,¿Cuáles son las dimensiones del equipo?
MINI-LINEA-RETRAC,Máquina Semi Industrial,Mesa de Corte,Mini-Linea con E/R,¿Por qué debería comprar este equipo?,¿Qué productos puede hacer?,¿Cuál es la capacidad de producción?,¿Mantenimiento requerido?,¿Cuáles son las dimensiones del equipo?
C12000,Máquina Semi Industrial,Medialunera / Croissants,C-12000,¿Por qué debería comprar este equipo?,¿Qué productos puede hacer?,¿Cuál es la capacidad de producción?,¿Mantenimiento requerido?,¿Cuáles son las dimensiones del equipo?
ARTESAN,Máquina,Divisora de masas hidratadas,Artesan,¿Por qué debería comprar este equipo?,¿Qué productos puede hacer?,¿Cuál es la capacidad de producción?,¿Mantenimiento requerido?,¿Cuáles son las dimensiones del equipo?
CHOPRA-III,Máquina,Depositadora,Chopra III,¿Por qué debería comprar este equipo?,¿Qué productos puede hacer?,¿Cuál es la capacidad de producción?,¿Mantenimiento requerido?,¿Cuáles son las dimensiones del equipo?
LINEA-PIZZAS,Máquina Semi Industrial,Mesa de Corte ,Linea Pizza 2.0,¿Por qué debería comprar este equipo?,¿Qué productos puede hacer?,¿Cuál es la capacidad de producción?,¿Mantenimiento requerido?,¿Cuáles son las dimensiones del equipo?
LINEA-EMPANADAS,Máquina,Mesa de Corte ,Compac,¿Por qué debería comprar este equipo?,¿Qué productos puede hacer?,¿Cuál es la capacidad de producción?,¿Mantenimiento requerido?,¿Cuáles son las dimensiones del equipo?
M-66,Máquina,Divisora de Masas  ,M-66I,¿Por qué debería comprar este equipo?,¿Qué productos puede hacer?,¿Cuál es la capacidad de producción?,¿Mantenimiento requerido?,¿Cuáles son las dimensiones del equipo?
LPN-520S,Máquina,Laminadora,Laminadora de Mesa LPN-520S,¿Por qué debería comprar este equipo?,¿Qué productos puede hacer?,¿Cuál es la capacidad de producción?,¿Mantenimiento requerido?,¿Cuáles son las dimensiones del equipo?
LIDO,Horno,Horno Rotativo 70x90,Lido,¿Por qué debería comprar este equipo?,¿Qué productos puede hacer?,¿Cuál es la capacidad de producción?,¿Mantenimiento requerido?,¿Cuáles son las dimensiones del equipo?
SPNI-500,Máquina,Sobadora,Sobadora Pastelera SPNI-500,¿Por qué debería comprar este equipo?,¿Qué productos puede hacer?,¿Cuál es la capacidad de producción?,¿Mantenimiento requerido?,¿Cuáles son las dimensiones del equipo?
BC1200I,Máquina,Bollera,BC-1200I,¿Por qué debería comprar este equipo?,¿Qué productos puede hacer?,¿Cuál es la capacidad de producción?,¿Mantenimiento requerido?,¿Cuáles son las dimensiones del equipo?
ARD6I-MOD,Máquina,Formadora,ARD6-I,¿Por qué debería comprar este equipo?,¿Qué productos puede hacer?,¿Cuál es la capacidad de producción?,¿Mantenimiento requerido?,¿Cuáles son las dimensiones del equipo?
FDPM,Máquina,Formadora de Pizzas,FDP,¿Por qué debería comprar este equipo?,¿Qué productos puede hacer?,¿Cuál es la capacidad de producción?,¿Mantenimiento requerido?,¿Cuáles son las dimensiones del equipo?
DB1200,Máquina,Divisora Volumetrica,DB-1200,¿Por qué debería comprar este equipo?,¿Qué productos puede hacer?,¿Cuál es la capacidad de producción?,¿Mantenimiento requerido?,¿Cuáles son las dimensiones del equipo?
TRANSP-BARRAS,Máquina,Transportador de Barras,Transportador Inclinado de Barras,¿Por qué debería comprar este equipo?,¿Qué productos puede hacer?,¿Cuál es la capacidad de producción?,¿Mantenimiento requerido?,¿Cuáles son las dimensiones del equipo?
INSIGNIA,Sistema Automático,Sistema de Panificacion,Insignia,¿Por qué debería comprar este equipo?,¿Qué productos puede hacer?,¿Cuál es la capacidad de producción?,¿Mantenimiento requerido?,¿Cuáles son las dimensiones del equipo?
AMBRO-PRESS,Máquina,Prensa Grasa,Ambro Press,¿Por qué debería comprar este equipo?,¿Qué productos puede hacer?,¿Cuál es la capacidad de producción?,¿Mantenimiento requerido?,¿Cuáles son las dimensiones del equipo?
RPNM-RPN,Máquina,Rebanadora Pan Molde,RPNM-12,¿Por qué debería comprar este equipo?,¿Qué productos puede hacer?,¿Cuál es la capacidad de producción?,¿Mantenimiento requerido?,¿Cuáles son las dimensiones del equipo?
FMI-10-12,Máquina,Formadora de masa,FMI-10,¿Por qué debería comprar este equipo?,¿Qué productos puede hacer?,¿Cuál es la capacidad de producción?,¿Mantenimiento requerido?,¿Cuáles son las dimensiones del equipo?
BPNV-300,Máquina,Depositadora,Bizcomatica BPNV-300,¿Por qué debería comprar este equipo?,¿Qué productos puede hacer?,¿Cuál es la capacidad de producción?,¿Mantenimiento requerido?,¿Cuáles son las dimensiones del equipo?
MP-1I,Máquina,Molino Rallador,MP-1I,¿Por qué debería comprar este equipo?,¿Qué productos puede hacer?,¿Cuál es la capacidad de producción?,¿Mantenimiento requerido?,¿Cuáles son las dimensiones del equipo?
DPN-2232,Máquina,Descortezadora,DPN-2232,¿Por qué debería comprar este equipo?,¿Qué productos puede hacer?,¿Cuál es la capacidad de producción?,¿Mantenimiento requerido?,¿Cuáles son las dimensiones del equipo?
MIX-60,Máquina,Batidora Planetaria,Mix-60,¿Por qué debería comprar este equipo?,¿Qué productos puede hacer?,¿Cuál es la capacidad de producción?,¿Mantenimiento requerido?,¿Cuáles son las dimensiones del equipo?
BHC,Máquina,Bollera,BHC,¿Por qué debería comprar este equipo?,¿Qué productos puede hacer?,¿Cuál es la capacidad de producción?,¿Mantenimiento requerido?,¿Cuáles son las dimensiones del equipo?
M-6130-17CORTE,Máquina,Laminadora,Refinadora M-600 Con E/C,¿Por qué debería comprar este equipo?,¿Qué productos puede hacer?,¿Cuál es la capacidad de producción?,¿Mantenimiento requerido?,¿Cuáles son las dimensiones del equipo?
DOSIF-RELLENO-X5,Máquina,Dosificadora,Dosificadora Multiple X5,¿Por qué debería comprar este equipo?,¿Qué productos puede hacer?,¿Cuál es la capacidad de producción?,¿Mantenimiento requerido?,¿Cuáles son las dimensiones del equipo?
CFC-Vision-40B,Cámara de Fermentación,Camara de Fermentacion 40B / 20B,Vision,¿Por qué debería comprar este equipo?,¿Qué productos puede hacer?,¿Cuál es la capacidad de producción?,¿Mantenimiento requerido?,¿Cuáles son las dimensiones del equipo?
TSI,Horno,Horno Combinado,TSI,¿Por qué debería comprar este equipo?,¿Qué productos puede hacer?,¿Cuál es la capacidad de producción?,¿Mantenimiento requerido?,¿Cuáles son las dimensiones del equipo?
Venecia,Horno,Horno Rapido,Venecia,¿Por qué debería comprar este equipo?,¿Qué productos puede hacer?,¿Cuál es la capacidad de producción?,¿Mantenimiento requerido?,¿Cuáles son las dimensiones del equipo?
Horeca-XL,Horno ,Horno Rapido,Horeca XL,¿Por qué debería comprar este equipo?,¿Qué productos puede hacer?,¿Cuál es la capacidad de producción?,¿Mantenimiento requerido?,¿Cuáles son las dimensiones del equipo?
MT-MODULAR,Máquina,Mesa de Corte,Mesa de Trabajo Modular,¿Por qué debería comprar este equipo?,¿Qué productos puede hacer?,¿Cuál es la capacidad de producción?,¿Mantenimiento requerido?,¿Cuáles son las dimensiones del equipo?
PORTO-20,Máquina,Amasadora Rapida Espiral,Porto-20,¿Por qué debería comprar este equipo?,¿Qué productos puede hacer?,¿Cuál es la capacidad de producción?,¿Mantenimiento requerido?,¿Cuáles son las dimensiones del equipo?
PORTO-40,Máquina,Amasadora Rapida Espiral,Porto-40,¿Por qué debería comprar este equipo?,¿Qué productos puede hacer?,¿Cuál es la capacidad de producción?,¿Mantenimiento requerido?,¿Cuáles son las dimensiones del equipo?
PORTO-80,Máquina,Amasadora Rapida Espiral,Porto-80,¿Por qué debería comprar este equipo?,¿Qué productos puede hacer?,¿Cuál es la capacidad de producción?,¿Mantenimiento requerido?,¿Cuáles son las dimensiones del equipo?
LPN-600,Máquina,Laminadora,LPN-600,¿Por qué debería comprar este equipo?,¿Qué productos puede hacer?,¿Cuál es la capacidad de producción?,¿Mantenimiento requerido?,¿Cuáles son las dimensiones del equipo?
RA12-PACK,Máquina,Rebanadora Pan Molde,RA12-Pack,¿Por qué debería comprar este equipo?,¿Qué productos puede hacer?,¿Cuál es la capacidad de producción?,¿Mantenimiento requerido?,¿Cuáles son las dimensiones del equipo?
ESCAMA-1-0,Máquina,Escamadora de Hielo,Escama-1.0,¿Por qué debería comprar este equipo?,¿En qué mejoran mis procesos?,¿Cuál es la capacidad de producción?,¿Mantenimiento requerido?,¿Cuáles son las dimensiones del equipo?
`.trim();

// ===================== 2) PARSER CSV SIMPLE =====================
type CsvRow = {
  COD_LISPRE: string;
  Categoría?: string;
  SubCategoría?: string;
  "Nombre Comercial del Producto"?: string;
  Preg1?: string;
  Preg2?: string;
  Preg3?: string;
  Preg4?: string;
  Preg5?: string;
};

function parseCSV(text: string): CsvRow[] {
  const lines = text.split(/\r?\n/);
  if (lines.length < 2) return [];
  const header = splitCsvLine(lines[0]);
  const rows: CsvRow[] = [];
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    const cols = splitCsvLine(line);
    const row: any = {};
    header.forEach((h, idx) => { row[h] = (cols[idx] ?? "").trim(); });
    rows.push(row as CsvRow);
  }
  return rows;
}

// Soporta comillas dobles en campos (por si en el futuro las usás)
function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') {
      if (inQuotes && line[i + 1] === '"') { cur += '"'; i++; }
      else { inQuotes = !inQuotes; }
    } else if (c === ',' && !inQuotes) {
      out.push(cur);
      cur = "";
    } else {
      cur += c;
    }
  }
  out.push(cur);
  return out;
}

// ===================== 3) MAPEO CSV POR ID =====================
const csvRows = parseCSV(RAW_CSV);
const csvById: Map<string, CsvRow> = new Map(
  csvRows
    .filter(r => r.COD_LISPRE && r.COD_LISPRE.trim())
    .map(r => [r.COD_LISPRE.trim(), r])
);

// ===================== 4) LISTA BASE DE AGENTES =====================
// 👉 Conservá tus agents base: IDs, accent y driveFolders son la "fuente de verdad".
//    name/family/subfamily/description/faqs/systemPrompt se completan desde el CSV si hay datos.
const faqsDefault =   [
      "¿Por qué debería comprar este equipo?",
      "¿Qué productos puede hacer y con qué nivel de producción?",
      "¿Es un equipo seguro?",
      "¿La cocción es pareja y eficiente?",
      "¿Cuáles son las dimensiones del equipo?"
    ];

const AGENTS_BASE: Agent[] = [
  {
    id: "FE960",
    name: "Horno rotativo FE 4.0-960",
    family: "Horno",
    subfamily: "Rotativo",
    description: "Especialista en horno rotativo FE 4.0-960 de Argental",
    accent: "from-blue-500 to-cyan-500",
    driveFolders: ["17enT9eKi8Wgr92wOhVlqHyIUFlZP1bo4", "1fuxxbhU_0__-YtpezDHaSa_6D9C2LEjo"],
    faqs: faqsDefault,
    systemPrompt: BASE_PROMPT({ agentId: "fe960", agentName: "Horno rotativo FE 4.0-960", primaryFolderLabel: "Info pública" }),
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
    faqs: faqsDefault,
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
    faqs:faqsDefault,
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
    faqs: faqsDefault,
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
    faqs:faqsDefault,
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
    faqs: faqsDefault,
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
    faqs: faqsDefault,
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
    faqs: faqsDefault,
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
    faqs: faqsDefault,
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
    faqs:faqsDefault,
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
    faqs: faqsDefault,
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
    faqs: faqsDefault,
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
    faqs:faqsDefault,
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
    faqs:faqsDefault,
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
    faqs: faqsDefault,
    systemPrompt: BASE_PROMPT({ agentId: "GT-38", agentName: "Grupo trinchador GT38-I Mod.", primaryFolderLabel: "Info pública" }),
  },
 {
    id: "FE-III-315-ROTATIVO",
    name: "Horno rotativo FE III-315",
    family:"Horno",
    subfamily:"A definir",
    description: "Especialista en Horno rotativo FE III-315 de Argental",
    accent: "from-blue-500 to-cyan-500",
    driveFolders: [
      "17MVKw06b02TN8JVaSiJFA4n_SscxhzIf",
      "1fuxxbhU_0__-YtpezDHaSa_6D9C2LEjo",
    ],
    faqs: faqsDefault,
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
    faqs: faqsDefault,
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
    faqs:faqsDefault,
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
    faqs: faqsDefault,
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
    faqs:faqsDefault,
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
    faqs:faqsDefault,
    systemPrompt: BASE_PROMPT({ agentId: "FE4-0-472", agentName: "Horno rotativo FE 4.0-472", primaryFolderLabel: "Info pública" }),
  },

 {
    id: "FE-BIO-960",
    name: "Horno rotativo FE 4.0-960 BIO",
    family:"Hornos",
    subfamily:"A definir",
    description: "Especialista en Horno rotativo FE 4.0-960 BIO",
    accent: "from-blue-500 to-cyan-500",
    driveFolders: [
      "1GNuLy8NigfTRvMrhWvBY5CgQ1XadM2gY",
      "1fuxxbhU_0__-YtpezDHaSa_6D9C2LEjo",
    ],
    faqs:faqsDefault,
    systemPrompt: BASE_PROMPT({ agentId: "FE-BIO-960", agentName: "Horno rotativo FE 4.0-960 BIO", primaryFolderLabel: "Info pública" }),
  },
   {
    id: "FE-BIO-472",
    name: "Horno rotativo FE 4.0-472 BIO",
    family:"Hornos",
    subfamily:"A definir",
    description: "Especialista en Horno rotativo FE 4.0-472 BIO",
    accent: "from-blue-500 to-cyan-500",
    driveFolders: [
      "1eMUxCPllX7plGpFd6fVC0dYQzeSXw7Z5",
      "1fuxxbhU_0__-YtpezDHaSa_6D9C2LEjo",
    ],
    faqs: faqsDefault,
    systemPrompt: BASE_PROMPT({ agentId: "FE-BIO-472", agentName: "Horno rotativo FE 4.0-472 BIO", primaryFolderLabel: "Info pública" }),
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
    faqs: faqsDefault,
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
    faqs: faqsDefault,
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
    faqs: faqsDefault,
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
    faqs: faqsDefault,
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
    faqs: faqsDefault,
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
    faqs: faqsDefault,
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
    faqs: faqsDefault,
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
      "1w-k7Cdit1S2Om1BaYh9Q5rx1INSSu1vx",
      "1fuxxbhU_0__-YtpezDHaSa_6D9C2LEjo",
    ],
    faqs: faqsDefault,
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
    faqs: faqsDefault,
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
    faqs: faqsDefault,
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
    faqs: faqsDefault,
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
    faqs: faqsDefault,
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
    faqs: faqsDefault,
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
    faqs: faqsDefault,
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
    faqs:faqsDefault,
    systemPrompt: BASE_PROMPT({ agentId: "PA390", agentName: "HORNO PANIER-III-7090 GN-IN-GAS-VM-PROG-T380/50", primaryFolderLabel: "Info pública" }),
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
    faqs: faqsDefault,
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
    faqs: faqsDefault,
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
    faqs: faqsDefault,
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
    faqs: faqsDefault,
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
    faqs: faqsDefault,
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
    faqs: faqsDefault,
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
    faqs: faqsDefault,
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
    faqs: faqsDefault,
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
    faqs: faqsDefault,
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
    faqs: faqsDefault,
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
    faqs: faqsDefault,
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
    faqs: faqsDefault,
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
    faqs: faqsDefault,
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
    faqs: faqsDefault,
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
    faqs: faqsDefault,
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
    faqs: faqsDefault,
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
    faqs: faqsDefault,
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
    faqs: faqsDefault,
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
    faqs: faqsDefault,
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
    faqs: faqsDefault,
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
    faqs: faqsDefault,
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
    faqs: faqsDefault,
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
    faqs: faqsDefault,
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
    faqs: faqsDefault,
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
    faqs: faqsDefault,
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
    faqs: faqsDefault,
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
    faqs: faqsDefault,
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
    faqs: faqsDefault,
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
    faqs: faqsDefault,
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
    faqs: faqsDefault,
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
    faqs: faqsDefault,
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
    faqs: faqsDefault,
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
    faqs: faqsDefault,
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
    faqs: faqsDefault,
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
    faqs: faqsDefault,
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
    faqs: faqsDefault,
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
    faqs: faqsDefault,
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
    faqs: faqsDefault,
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
    faqs: faqsDefault,
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
    faqs: faqsDefault,
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
    faqs: faqsDefault,
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
    faqs: faqsDefault,
    systemPrompt: BASE_PROMPT({ agentId: "M-6130-17CORTE", agentName: "AMBRO - Laminadora M-600 con estación de corte ", primaryFolderLabel: "Info pública" }),
  },
    {
    id: "CFC-Vision-40B",
    name: "CAMARA FERM. CONT. ARGENTAL CFC40B VISION M220/50   ",
    family:"Camara de fermentacion",
    subfamily:"A definir",
    description: "Especialista en CAMARA FERM. CONT. ARGENTAL CFC40B VISION M220/50 de Argental",
    accent: "from-blue-500 to-cyan-500",
    driveFolders: [
      "1B9sjckr0xcgTjRoFkx3yoknRtzyNKV9x",
      "1fuxxbhU_0__-YtpezDHaSa_6D9C2LEjo",
    ],
    faqs: faqsDefault,
    systemPrompt: BASE_PROMPT({ agentId: "CFC-Vision-40B", agentName: "CAMARA FERM. CONT. ARGENTAL CFC40B VISION M220/50", primaryFolderLabel: "Info pública" }),
  },
      {
    id: "TSI",
    name: "HORNO COMBINADO ELECTRICO TSI",
    family:"Horno Combinado",
    subfamily:"A definir",
    description: "Especialista en HORNO COMBINADO ELECTRICO TSI de Argental",
    accent: "from-blue-500 to-cyan-500",
    driveFolders: [
      "1_fkPyOkrKkV_0jm7EVwUNla-MOScAFnm",
      "1fuxxbhU_0__-YtpezDHaSa_6D9C2LEjo",
    ],
    faqs: faqsDefault,
    systemPrompt: BASE_PROMPT({ agentId: "TSI", agentName: "HORNO COMBINADO ELECTRICO TSI", primaryFolderLabel: "Info pública" }),
  },
        {
    id: "Venecia",
    name: "HORNO RAPIDO ELECTRICO VENECIA",
    family:"Horno Rapido",
    subfamily:"A definir",
    description: "Especialista en HORNO RAPIDO ELECTRICO VENECIA de Argental",
    accent: "from-blue-500 to-cyan-500",
    driveFolders: [
      "1WFkszndnW677weDbJGmAfMXu2w6hztdT",
      "1fuxxbhU_0__-YtpezDHaSa_6D9C2LEjo",
    ],
    faqs: faqsDefault,
    systemPrompt: BASE_PROMPT({ agentId: "Venecia", agentName: "HORNO RAPIDO ELECTRICO VENECIA", primaryFolderLabel: "Info pública" }),
  },
       {
    id: "Horeca-XL",
    name: "HORNO RAPIDO ELECTRICO HORECA XL",
    family:"Horno Rapido",
    subfamily:"A definir",
    description: "Especialista en HORNO RAPIDO ELECTRICO HORECA XL de Argental",
    accent: "from-blue-500 to-cyan-500",
    driveFolders: [
      "1keIDRpKwqQDRIT1H3VWzTKnHe3n7VGZ1",
      "1fuxxbhU_0__-YtpezDHaSa_6D9C2LEjo",
    ],
    faqs: faqsDefault,
    systemPrompt: BASE_PROMPT({ agentId: "Horeca-XL", agentName: "HORNO RAPIDO ELECTRICO HORECA XL", primaryFolderLabel: "Info pública" }),
  },
         {
    id: "MT-MODULAR",
    name: "MESA DE TRABAJO MODULAR",
    family:"Mesa de trabajo",
    subfamily:"A definir",
    description: "Especialista en MESA DE TRABAJO MODULAR de Argental",
    accent: "from-blue-500 to-cyan-500",
    driveFolders: [
      "1RAj7biEvZQPgs4l3E5kJdGgzSDKnwDNL",
      "1fuxxbhU_0__-YtpezDHaSa_6D9C2LEjo",
    ],
    faqs: faqsDefault,
    systemPrompt: BASE_PROMPT({ agentId: "MT-MODULAR", agentName: "MESA DE TRABAJO MODULAR", primaryFolderLabel: "Info pública" }),
  },
         {
    id: "PORTO-20",
    name: "AMASADORA PANIER PA20",
    family:"A definir",
    subfamily:"A definir",
    description: "Especialista en AMASADORA PANIER PA20 de Argental",
    accent: "from-blue-500 to-cyan-500",
    driveFolders: [
      "1aY3M6Azo5BbSiU5fGd_dtiEnjphRkbRf",
      "1fuxxbhU_0__-YtpezDHaSa_6D9C2LEjo",
    ],
    faqs: faqsDefault,
    systemPrompt: BASE_PROMPT({ agentId: "PORTO-20", agentName: "AMASADORA PANIER PA20", primaryFolderLabel: "Info pública" }),
  },
  {
    id: "PORTO-40",
    name: "AMASADORA PANIER PA40",
    family:"A definir",
    subfamily:"A definir",
    description: "Especialista en AMASADORA PANIER PA40 de Argental",
    accent: "from-blue-500 to-cyan-500",
    driveFolders: [
      "1l-GmqKUpQZQ74GzitN4ZpVlvDNoH2oQ0",
      "1fuxxbhU_0__-YtpezDHaSa_6D9C2LEjo",
    ],
    faqs: faqsDefault,
    systemPrompt: BASE_PROMPT({ agentId: "PORTO-40", agentName: "AMASADORA PANIER PA40", primaryFolderLabel: "Info pública" }),
  },
   {
    id: "PORTO-80",
    name: "AMASADORA PANIER PA80",
    family:"A definir",
    subfamily:"A definir",
    description: "Especialista en AMASADORA PANIER PA80 de Argental",
    accent: "from-blue-500 to-cyan-500",
    driveFolders: [
      "1lM3qIvtwExtCgJKTmkfEfiskR-Yueah6",
      "1fuxxbhU_0__-YtpezDHaSa_6D9C2LEjo",
    ],
    faqs: faqsDefault,
    systemPrompt: BASE_PROMPT({ agentId: "PORTO-80", agentName: "AMASADORA PANIER PA80", primaryFolderLabel: "Info pública" }),
  },
  {
    id: "LPN-600",
    name: "LPN-600",
    family:"Maquina",
    subfamily:"Laminadora",
    description: "Especialista en LPN-600 de Argental",
    accent: "from-blue-500 to-cyan-500",
    driveFolders: [
      "1FKS9hrrrsXwezKnfuLiRGXm4433yXRRD",
      "1fuxxbhU_0__-YtpezDHaSa_6D9C2LEjo",
    ],
    faqs: faqsDefault,
    systemPrompt: BASE_PROMPT({ agentId: "LPN-600", agentName: "LPN-600", primaryFolderLabel: "Info pública" }),
  },
    {
    id: "RA12-PACK",
    name: "RA12-Pack",
    family:"Maquina",
    subfamily:"Rebanadora Pan Molde",
    description: "Especialista en RA12-Pack de Argental",
    accent: "from-blue-500 to-cyan-500",
    driveFolders: [
      "1xkPXd1LGY9OjGR84Sc3nMDMbPkjD5RJi",
      "1fuxxbhU_0__-YtpezDHaSa_6D9C2LEjo",
    ],
    faqs: faqsDefault,
    systemPrompt: BASE_PROMPT({ agentId: "RA12-PACK", agentName: "RA12-Pack", primaryFolderLabel: "Info pública" }),
  },
      {
    id: "ESCAMA-1-0",
    name: "ESCAMA-1.0",
    family:"Maquina",
    subfamily:"Escamadora de Hielo",
    description: "Especialista en ESCAMA-1.0 de Argental",
    accent: "from-blue-500 to-cyan-500",
    driveFolders: [
      "1OzsHpfxdMll_XMOrdq1l1IqsDuXJUrK-",
      "1fuxxbhU_0__-YtpezDHaSa_6D9C2LEjo",
    ],
    faqs: faqsDefault,
    systemPrompt: BASE_PROMPT({ agentId: "ESCAMA-1-0", agentName: "ESCAMA-1.0", primaryFolderLabel: "Info pública" }),
  },
        {
    id: "DOSIF-RELLENO-X5",
    name: "Dosificadora Multiple X5",
    family:"Maquina",
    subfamily:"Dosificadora",
    description: "Especialista en Dosificadora Multiple X5 de Argental",
    accent: "from-blue-500 to-cyan-500",
    driveFolders: [
      "1iyb8UQtky847k4v5pHSWPOiQ2HbxR_v_",
      "1fuxxbhU_0__-YtpezDHaSa_6D9C2LEjo",
    ],
    faqs: faqsDefault,
    systemPrompt: BASE_PROMPT({ agentId: "DOSIF-RELLENO-X5", agentName: "Dosificadora Multiple X5", primaryFolderLabel: "Info pública" }),
  },
];

// ===================== 5) FUNCIÓN DE MERGE DESDE CSV =====================
function normalizeId(id: string) {
  return (id || "").trim();
}
function emptyToUndefined(s?: string) {
  const t = (s ?? "").trim();
  return t.length ? t : undefined;
}

function applyCsvToAgent(agent: Agent): Agent {
  const idUpper = normalizeId(agent.id).toUpperCase(); // en tu CSV los IDs vienen mayormente en MAYÚSCULAS
  const idExact = csvById.get(agent.id) || csvById.get(idUpper);
  if (!idExact) {
    // Sin fila en CSV → devolvemos el agente tal como está
    return agent;
  }

  const nameFromCsv = emptyToUndefined(idExact["Nombre Comercial del Producto"]);
  const familyFromCsv = emptyToUndefined(idExact["Categoría"]);
  const subfamilyFromCsv = emptyToUndefined(idExact["SubCategoría"]);

  const p1 = emptyToUndefined(idExact.Preg1);
  const p2 = emptyToUndefined(idExact.Preg2);
  const p3 = emptyToUndefined(idExact.Preg3);
  const p4 = emptyToUndefined(idExact.Preg4);
  const p5 = emptyToUndefined(idExact.Preg5);
  const newName = nameFromCsv ?? agent.name;
  const newFamily = familyFromCsv ?? agent.family;
  const newSubfamily = subfamilyFromCsv ?? agent.subfamily;

  const newFaqs = [p1, p2, p3, p4, p5].filter(Boolean) as string[];
  const faqs = newFaqs.length ? newFaqs : agent.faqs;

  const description = `Especialista en ${newName} de Argental`;
  const systemPrompt = BASE_PROMPT({
    agentId: agent.id,
    agentName: newName,
    primaryFolderLabel: "Info pública",
  });

  return {
    ...agent,
    name: newName,
    family: newFamily,
    subfamily: newSubfamily,
    description,
    faqs,
    systemPrompt,
  };
}
export function buildAgentPrompt(agentId: string, agentName: string, adminMode: boolean, primaryFolderLabel?: string) {
  return BASE_PROMPT({ agentId, agentName, primaryFolderLabel, adminMode });
}
// ===================== 6) EXPORT FINAL =====================
export const AGENTS: Agent[] = AGENTS_BASE.map(applyCsvToAgent);

export function getAgentById(id: string) {
  return AGENTS.find(a => a.id === id);
}





