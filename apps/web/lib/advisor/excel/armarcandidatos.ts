// =============================================================================
// Etapa 2 del flujo: a partir del catálogo y de lo que dijo el cliente
// (productos, etapas que ya tiene cubiertas y si congela), arma las opciones
// candidatas de cada etapa del proceso. No usa IA.
//
// Reglas:
// - Se usan las filas de SISTEMAS de los productos del cliente.
// - Se excluyen las etapas que el cliente ya tiene cubiertas y, si no congela,
//   la etapa de congelado.
// - En las etapas de "alternativas", cada equipo es una opción individual.
//   En las demás, los equipos de una fila forman un conjunto.
// - Cada equipo se traduce a su ID Busquetti. Si no tiene ID o su agente no
//   está disponible, se saltea; si es parte de un conjunto, se saltea el
//   conjunto entero (no se puede recomendar una línea incompleta).
// =============================================================================

import { normalizar } from "./leercatalogo";
import type {
  Aviso,
  Busqueda,
  Catalogo,
  EquipoOpcion,
  EtapaCandidatos,
  OpcionCandidata,
  ResultadoCandidatos,
} from "./types";

/**
 * Función que indica si un agente existe y está habilitado.
 * Se recibe desde afuera (en la app: getAgentById de agents.ts) para que este
 * módulo no dependa de agents.ts y se pueda probar solo.
 */
export type AgenteDisponible = (idBusquetti: string) => boolean;

export function armarCandidatos(
  catalogo: Catalogo,
  busqueda: Busqueda,
  agenteDisponible: AgenteDisponible,
): ResultadoCandidatos {
  const avisos: Aviso[] = [];

  // 1. Filas de los productos del cliente.
  const productosCliente = new Set(busqueda.productos.map(normalizar));
  const filas = catalogo.filas.filter((f) => productosCliente.has(normalizar(f.producto)));
  if (filas.length === 0) {
    avisos.push({ codigo: "sin_filas", mensaje: `Ningún producto del cliente (${busqueda.productos.join(", ")}) tiene filas en la hoja SISTEMAS.` });
    return { etapas: [], avisos };
  }

  // 2. Etapas a excluir.
  const cubiertas = new Set(busqueda.etapas_cubiertas.map(normalizar));
  const etapas = catalogo.etapas.filter((e) => {
    if (cubiertas.has(normalizar(e.nombre))) return false;
    if (e.esCongelado && busqueda.congela === false) return false;
    return true;
  });

  // Traduce un nombre comercial a un equipo con ID, o null si no se puede usar.
  const resolver = (nombre: string): EquipoOpcion | null => {
    const equipo = catalogo.equipos[normalizar(nombre)];
    if (!equipo || !equipo.idBusquetti) return null; // ya reportado por leerCatalogo
    if (!agenteDisponible(equipo.idBusquetti)) {
      avisos.push({ codigo: "agente_no_disponible", mensaje: `El agente "${equipo.idBusquetti}" (${nombre}) no existe o está deshabilitado; se saltea.` });
      return null;
    }
    return { id: equipo.idBusquetti, nombreComercial: equipo.nombreComercial, marca: equipo.marca, tipoEquipo: equipo.tipoEquipo };
  };

  const resultado: EtapaCandidatos[] = [];

  for (const etapa of etapas) {
    const opciones = new Map<string, OpcionCandidata>();
    let habiaEquipos = false;

    // Agrega una opción, o la combina con una igual que ya vino de otra fila.
    const agregar = (opcion: OpcionCandidata) => {
      const existente = opciones.get(opcion.clave);
      if (!existente) {
        opciones.set(opcion.clave, opcion);
        return;
      }
      existente.preferencia = Math.min(existente.preferencia, opcion.preferencia);
      for (const s of opcion.sistemas) if (!existente.sistemas.includes(s)) existente.sistemas.push(s);
      for (const p of opcion.productos) if (!existente.productos.includes(p)) existente.productos.push(p);
    };

    for (const fila of filas) {
      const nombres = fila.equiposPorEtapa[etapa.nombre];
      if (!nombres || nombres.length === 0) continue;
      habiaEquipos = true;
      const sistemas = fila.sistema !== null ? [fila.sistema] : [];

      if (etapa.tipo === "alternativas") {
        // Cada equipo es una opción; su preferencia es su posición en el grupo.
        nombres.forEach((nombre, i) => {
          const equipo = resolver(nombre);
          if (!equipo) return;
          agregar({ clave: equipo.id, tipo: "individual", equipos: [equipo], preferencia: i + 1, sistemas: [...sistemas], productos: [fila.producto] });
        });
      } else {
        // Todos los equipos de la fila forman un conjunto.
        const equipos = nombres.map(resolver);
        if (equipos.some((e) => e === null)) {
          avisos.push({ codigo: "conjunto_incompleto", mensaje: `El conjunto "${nombres.join(" + ")}" (fila ${fila.filaExcel}, ${etapa.nombre}) tiene equipos sin agente; se saltea entero.`, fila: fila.filaExcel });
          continue;
        }
        const validos = equipos as EquipoOpcion[];
        if (validos.length === 1) {
          agregar({ clave: validos[0].id, tipo: "individual", equipos: validos, preferencia: 1, sistemas: [...sistemas], productos: [fila.producto] });
        } else {
          const clave = validos.map((e) => e.id).sort().join("+");
          agregar({ clave, tipo: "conjunto", equipos: validos, preferencia: 1, sistemas: [...sistemas], productos: [fila.producto] });
        }
      }
    }

    if (opciones.size > 0) {
      const ordenadas = Array.from(opciones.values()).sort(
        (a, b) => a.preferencia - b.preferencia || Math.min(...a.sistemas, 99) - Math.min(...b.sistemas, 99),
      );
      resultado.push({ etapa: etapa.nombre, orden: etapa.orden, tipo: etapa.tipo, opciones: ordenadas });
    } else if (habiaEquipos) {
      avisos.push({ codigo: "etapa_sin_candidatos", mensaje: `La etapa "${etapa.nombre}" tiene equipos en el Excel, pero ninguno con agente disponible.` });
    }
  }

  return { etapas: resultado, avisos };
}