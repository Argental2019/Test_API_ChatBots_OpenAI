// =============================================================================
// Preparación (Prompt 1): arma la lista de máquinas de un tipo de equipo, con
// las carpetas de Drive de cada una, para enviarla al backend.
//
// - El tipo de cada máquina sale de la columna "Tipo de equipo" de COD LISPRE.
// - Las carpetas salen del agente individual (agents.ts) del ID Busquetti.
// - Se excluyen las carpetas comunes a todos los agentes ("Info pública
//   general"), para no repetir el mismo contenido una vez por máquina.
//
// No depende de agents.ts ni del backend: recibe todo como parámetros, así se
// puede probar sola.
// =============================================================================

import { normalizar } from "../excel/leercatalogo";
import type { Catalogo, EquipoCatalogo } from "../excel/types";

/** Lo mínimo que se necesita de un agente de agents.ts. */
export interface AgenteParaPreparacion {
  id: string;
  driveFolders: string[];
}

/** Devuelve el agente habilitado con ese ID, o undefined (en la app: getAgentById). */
export type BuscarAgente = (idBusquetti: string) => AgenteParaPreparacion | undefined;

/** Formato que espera POST /advisor/preparation/schema del backend. */
export interface MaquinaParaPreparacion {
  idBusquetti: string;
  nombreModelo: string;
  driveFolders: string[];
}

export interface MaquinaOmitida {
  nombre: string;
  motivo: string;
}

export interface ResultadoMaquinasDeTipo {
  /** El tipo tal como está escrito en el Excel (se usa en la clave de Redis). */
  tipoEquipo: string;
  maquinas: MaquinaParaPreparacion[];
  omitidas: MaquinaOmitida[];
}

/**
 * Equipos del catálogo sin repetir. El catálogo registra cada equipo bajo
 * varias claves (nombre comercial, COD_LISPRE, ID Busquetti), así que el
 * mismo objeto aparece más de una vez en catalogo.equipos.
 */
function equiposUnicos(catalogo: Catalogo): EquipoCatalogo[] {
  return Array.from(new Set(Object.values(catalogo.equipos)));
}

/** Tipos de equipo cargados en el Excel, sin repetir (útil para informar errores). */
export function tiposDeEquipo(catalogo: Catalogo): string[] {
  const tipos: string[] = [];
  for (const equipo of equiposUnicos(catalogo)) {
    const tipo = equipo.tipoEquipo;
    if (tipo && !tipos.some((t) => normalizar(t) === normalizar(tipo))) tipos.push(tipo);
  }
  return tipos.sort();
}

export function maquinasDeTipo(
  catalogo: Catalogo,
  tipoPedido: string,
  buscarAgente: BuscarAgente,
  carpetasExcluidas: string[],
): ResultadoMaquinasDeTipo {
  const tipoNormal = normalizar(tipoPedido);
  const excluidas = new Set(carpetasExcluidas);
  const maquinas: MaquinaParaPreparacion[] = [];
  const omitidas: MaquinaOmitida[] = [];
  let tipoEquipo = tipoPedido.trim();

  const delTipo = equiposUnicos(catalogo).filter((e) => e.tipoEquipo && normalizar(e.tipoEquipo) === tipoNormal);
  if (delTipo.length > 0 && delTipo[0].tipoEquipo) tipoEquipo = delTipo[0].tipoEquipo;

  for (const equipo of delTipo) {
    if (!equipo.idBusquetti) {
      omitidas.push({ nombre: equipo.nombreComercial, motivo: "No tiene ID Busquetti en el Excel." });
      continue;
    }
    if (maquinas.some((m) => m.idBusquetti === equipo.idBusquetti)) {
      omitidas.push({ nombre: equipo.nombreComercial, motivo: `Comparte el ID Busquetti ${equipo.idBusquetti} con otra fila; se usa la primera.` });
      continue;
    }
    const agente = buscarAgente(equipo.idBusquetti);
    if (!agente) {
      omitidas.push({ nombre: equipo.nombreComercial, motivo: `El agente ${equipo.idBusquetti} no existe o está deshabilitado.` });
      continue;
    }
    const driveFolders = agente.driveFolders.filter((f) => !excluidas.has(f));
    if (driveFolders.length === 0) {
      omitidas.push({ nombre: equipo.nombreComercial, motivo: `El agente ${equipo.idBusquetti} no tiene carpetas propias.` });
      continue;
    }
    maquinas.push({ idBusquetti: equipo.idBusquetti, nombreModelo: equipo.nombreComercial, driveFolders });
  }

  return { tipoEquipo, maquinas, omitidas };
}