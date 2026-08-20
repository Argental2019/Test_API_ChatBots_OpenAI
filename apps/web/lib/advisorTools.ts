// apps/web/lib/advisorTools.ts
import { AGENTS } from "./agents";
import knowledgeRaw from "./agentKnowledge.json";

const knowledge = knowledgeRaw as Record<string, {
  id: string;
  name: string;
  family: string;
  description: string;
  knowledge: Record<string, string>;
}>;

export type AgentSummary = {
  id: string;
  name: string;
  family: string;
  subfamily: string;
  description: string;
  url: string;
  image?: string;
};

/**
 * Devuelve un resumen liviano de todos los agentes disponibles.
 * El orquestador usa esto para saber qué equipos puede recomendar.
 */
export function getAgentCatalog(): AgentSummary[] {
  return AGENTS.map((a) => ({
    id: a.id,
    name: a.name,
    family: a.family,
    subfamily: a.subfamily,
    description: a.description,
    url: `/agent/${a.id}`,
    image: (a as any).image,
  }));
}

/**
 * Devuelve el catálogo como texto plano enriquecido con el conocimiento
 * generado automáticamente de cada agente.
 */
export function getCatalogAsText(): string {
  return AGENTS.map((a) => {
    const k = knowledge[a.id];
    const lines = [
      `## ${a.name} (ID: ${a.id})`,
      `Familia: ${a.family} | Subfamilia: ${a.subfamily}`,
    ];

    if (k?.knowledge) {
      const entries = Object.values(k.knowledge).filter(Boolean);
      if (entries.length > 0) {
        // Tomamos las primeras 2 respuestas para no saturar el contexto
        lines.push(entries.slice(0, 2).join(" ").slice(0, 400));
      }
    }

    return lines.join("\n");
  }).join("\n\n");
}

/**
 * Busca agentes por IDs y devuelve sus datos para armar los links.
 */
export function getAgentsByIds(ids: string[]): AgentSummary[] {
  return ids
    .map((id) => {
      const agent = AGENTS.find((a) => a.id === id);
      if (!agent) return null;
      return {
        id: agent.id,
        name: agent.name,
        family: agent.family,
        subfamily: agent.subfamily,
        description: agent.description,
        url: `/agent/${agent.id}`,
        image: (agent as any).image,
      };
    })
    .filter(Boolean) as AgentSummary[];
}