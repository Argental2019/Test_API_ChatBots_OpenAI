// apps/web/scripts/generate-knowledge.mjs
// Ejecutar con: node scripts/generate-knowledge.mjs
// Requiere OPENAI_API_KEY en el entorno

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

if (!OPENAI_API_KEY) {
  console.error("❌ Falta OPENAI_API_KEY en el entorno");
  process.exit(1);
}

// ── Preguntas que le hacemos a cada agente ────────────────────────────────
const QUESTIONS = [
  "¿Para qué tipo de productos de panadería o pastelería sirve este equipo? ¿Para cuáles NO sirve?",
  "¿Qué volumen de producción maneja? ¿Cuáles son sus límites de capacidad?",
  "¿Con qué otros equipos de la línea de producción se combina o complementa?",
  "¿Cuándo conviene elegir este equipo y cuándo no? ¿Qué factores determinan si es la opción correcta?",
  "¿Qué tipo de energía requiere y qué espacio mínimo necesita?",
];

// ── Leer agents.ts y extraer los agentes ─────────────────────────────────
async function loadAgents() {
  const agentsPath = path.join(__dirname, "../lib/agents.ts");
  const content = fs.readFileSync(agentsPath, "utf-8");

  // Extraer los systemPrompts y datos básicos parseando el texto
  const agents = [];
  const idMatches = content.matchAll(/id:\s*["']([^"']+)["']/g);
  const nameMatches = [...content.matchAll(/name:\s*["']([^"']+)["']/g)];
  const familyMatches = [...content.matchAll(/family:\s*["']([^"']+)["']/g)];
  const promptMatches = [...content.matchAll(/systemPrompt:\s*([^,]+(?:BASE_PROMPT[^)]+\))[^,]*)/g)];

  // Mejor enfoque: usar regex para extraer bloques de agente
  const blockRegex = /\{\s*id:\s*["']([^"']+)["'][^}]*name:\s*["']([^"']+)["'][^}]*family:\s*["']([^"']+)["'][^}]*description:\s*["']([^"']+)["']/gs;
  
  let match;
  while ((match = blockRegex.exec(content)) !== null) {
    agents.push({
      id: match[1],
      name: match[2],
      family: match[3],
      description: match[4],
    });
  }

  return agents;
}

// ── Llamar a OpenAI ───────────────────────────────────────────────────────
async function askAgent(agent, question) {
  const systemPrompt = `Sos un especialista técnico de Argental en el equipo "${agent.name}" (${agent.family}). 
${agent.description}
Respondé de forma concisa y directa, en español, máximo 3 párrafos.`;

  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      temperature: 0.1,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: question },
      ],
    }),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`OpenAI error: ${err}`);
  }

  const data = await response.json();
  return data.choices[0].message.content.trim();
}

// ── Main ──────────────────────────────────────────────────────────────────
async function main() {
  console.log("🚀 Iniciando generación de conocimiento...\n");

  const agents = await loadAgents();
  console.log(`📦 ${agents.length} agentes encontrados\n`);

  const outputPath = path.join(__dirname, "../lib/agentKnowledge.json");
  const knowledge = {};

  for (let i = 0; i < agents.length; i++) {
    const agent = agents[i];
    console.log(`[${i + 1}/${agents.length}] ${agent.name}...`);

    knowledge[agent.id] = {
      id: agent.id,
      name: agent.name,
      family: agent.family,
      description: agent.description,
      knowledge: {},
    };

    for (const question of QUESTIONS) {
      try {
        const answer = await askAgent(agent, question);
        knowledge[agent.id].knowledge[question] = answer;
        process.stdout.write("  ✓ ");
      } catch (err) {
        console.error(`  ✗ Error: ${err.message}`);
        knowledge[agent.id].knowledge[question] = "";
      }

      // Pequeña pausa para no saturar la API
      await new Promise((r) => setTimeout(r, 300));
    }

    console.log("");

    // Guardar progreso cada 10 agentes
    if ((i + 1) % 10 === 0) {
      fs.writeFileSync(outputPath, JSON.stringify(knowledge, null, 2));
      console.log(`💾 Progreso guardado (${i + 1} agentes)\n`);
    }
  }

  // Guardar resultado final
  fs.writeFileSync(outputPath, JSON.stringify(knowledge, null, 2));
  console.log(`\n✅ Listo. Conocimiento guardado en lib/agentKnowledge.json`);
  console.log(`📊 Total: ${agents.length} agentes procesados`);
}

main().catch(console.error);