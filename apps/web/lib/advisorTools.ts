// apps/web/lib/advisorTools.ts
import { AGENTS } from "./agents";

export type AgentSummary = {
  id: string;
  name: string;
  family: string;
  subfamily: string;
  description: string;
  url: string;
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
  }));
}

/**
 * Devuelve el catálogo como texto plano para meterlo en el prompt del orquestador.
 */
export function getCatalogAsText(): string {
  const catalog = getAgentCatalog();
  return catalog
    .map((a) => `- ID: ${a.id} | ${a.family} > ${a.subfamily} | ${a.name}`)
    .join("\n");
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
      };
    })
    .filter(Boolean) as AgentSummary[];
}