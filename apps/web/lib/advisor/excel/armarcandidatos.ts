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
// - Capacidad de referencia de cada equipo (la usa la comparación cuando la
//   ficha no permite calcular la capacidad):
//   - si tiene "Kg harina por turno 8 h" en COD LISPRE y se conocen las horas
//     de trabajo del cliente: kg por turno de 8 h × horas ÷ 8;
//   - si no, el mayor "consumo de harina máx." de las filas donde aparece.
// - Filtro por capacidad (para que la comparación revise menos equipos): en
//   cada etapa y por marca, de los equipos individuales con capacidad
//   calculada se conservan el más chico que cubre el volumen del cliente y el
//   siguiente más grande (de respaldo, por si el primero no cumple otro
//   requisito). Si ninguno cubre el volumen, se conserva el más grande, para
//   que la comparación explique por qué no alcanza. Los equipos sin capacidad
//   calculada y los conjuntos pasan siempre, como antes.
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

/** Horas del turno al que se refiere la columna "Kg harina por turno 8 h". */
const HORAS_TURNO_REFERENCIA = 8;

/** Devuelve el número si es mayor que 0; si no, null. */
function numeroPositivo(valor: unknown): number | null {
  return typeof valor === "number" && Number.isFinite(valor) && valor > 0 ? valor : null;
}

/** Redondea a un decimal (la capacidad se informa en kg de harina por día). */
function redondear(valor: number): number {
  return Math.round(valor * 10) / 10;
}

/**
 * Filtro por capacidad de una etapa (ver las reglas al principio del archivo).
 * Devuelve las opciones que pasan, en el mismo orden en que llegaron.
 */
function filtrarPorCapacidad(
  opciones: OpcionCandidata[],
  volumen: number,
  capacidadCalculada: Map<string, number>,
): { opciones: OpcionCandidata[]; descartadas: string[] } {
  // Solo se miden las opciones de un equipo con capacidad calculada.
  const porMarca = new Map<string, { opcion: OpcionCandidata; capacidad: number }[]>();

  for (const opcion of opciones) {
    if (opcion.tipo !== "individual" || opcion.equipos.length !== 1) continue;

    const equipo = opcion.equipos[0];
    const capacidad = capacidadCalculada.get(equipo.id);
    if (capacidad === undefined) continue;

    const marca = normalizar(equipo.marca) || "SIN MARCA";
    const lista = porMarca.get(marca) ?? [];
    lista.push({ opcion, capacidad });
    porMarca.set(marca, lista);
  }

  const descartadas = new Set<OpcionCandidata>();

  for (const lista of porMarca.values()) {
    lista.sort((a, b) => a.capacidad - b.capacidad);

    const primeraQueCubre = lista.findIndex((item) => item.capacidad >= volumen);

    // Índices que se conservan: la más chica que cubre y la siguiente;
    // si ninguna cubre, la más grande.
    const conservar =
      primeraQueCubre >= 0
        ? new Set([primeraQueCubre, primeraQueCubre + 1])
        : new Set([lista.length - 1]);

    lista.forEach((item, indice) => {
      if (!conservar.has(indice)) descartadas.add(item.opcion);
    });
  }

  return {
    opciones: opciones.filter((opcion) => !descartadas.has(opcion)),
    descartadas: Array.from(descartadas).map((opcion) => opcion.clave),
  };
}

export function armarCandidatos(
  catalogo: Catalogo,
  busqueda: Busqueda,
  agenteDisponible: AgenteDisponible,
): ResultadoCandidatos {
  const avisos: Aviso[] = [];

  // Datos del cliente para la capacidad (los completa el Prompt 3).
  const horasCliente = numeroPositivo(busqueda.horas_trabajo_dia);
  const volumenCliente = numeroPositivo(busqueda.volumen_kg_harina_dia);

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

  // Kg de harina por turno de 8 h de cada equipo usado (de COD LISPRE).
  const kgTurnoPorId = new Map<string, number>();

  // Traduce un nombre comercial a un equipo con ID, o null si no se puede usar.
  const resolver = (nombre: string): EquipoOpcion | null => {
    const equipo = catalogo.equipos[normalizar(nombre)];
    if (!equipo || !equipo.idBusquetti) return null; // ya reportado por leerCatalogo
    if (!agenteDisponible(equipo.idBusquetti)) {
      avisos.push({ codigo: "agente_no_disponible", mensaje: `El agente "${equipo.idBusquetti}" (${nombre}) no existe o está deshabilitado; se saltea.` });
      return null;
    }
    if (equipo.kgHarinaTurno8h !== null && equipo.kgHarinaTurno8h !== undefined) {
      kgTurnoPorId.set(equipo.idBusquetti, equipo.kgHarinaTurno8h);
    }
        return {
      id: equipo.idBusquetti,
      nombreComercial: equipo.nombreComercial,
      marca: equipo.marca,
      tipoEquipo: equipo.tipoEquipo,
      capacidadReferenciaExcel: null, // se completa al terminar la etapa
    };
  };

  const resultado: EtapaCandidatos[] = [];

  for (const etapa of etapas) {
    const opciones = new Map<string, OpcionCandidata>();
    let habiaEquipos = false;

    // Agrega una opción, o la combina con una igual que ya vino de otra fila.
        // Mayor consumo de harina máx. de las filas donde aparece cada equipo.
    const capacidadPorEquipo = new Map<string, number>();

    // Agrega una opción, o la combina con una igual que ya vino de otra fila.
    // También registra el consumo máximo de la fila para cada equipo de la opción.
    const agregar = (opcion: OpcionCandidata, consumoFila: number | null) => {
      if (consumoFila !== null) {
        for (const equipo of opcion.equipos) {
          capacidadPorEquipo.set(
            equipo.id,
            Math.max(capacidadPorEquipo.get(equipo.id) ?? 0, consumoFila),
          );
        }
      }

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
            agregar({ clave: equipo.id, tipo: "individual", equipos: [equipo], preferencia: i + 1, sistemas: [...sistemas], productos: [fila.producto] }, fila.consumoMaxKgDia);
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
            agregar({ clave: validos[0].id, tipo: "individual", equipos: validos, preferencia: 1, sistemas: [...sistemas], productos: [fila.producto] }, fila.consumoMaxKgDia);
        } else {
          const clave = validos.map((e) => e.id).sort().join("+");
                      agregar({ clave, tipo: "conjunto", equipos: validos, preferencia: 1, sistemas: [...sistemas], productos: [fila.producto] }, fila.consumoMaxKgDia);
        }
      }
    }

    // Capacidad de referencia de cada equipo:
    // - con "Kg harina por turno 8 h" y horas del cliente: se calcula;
    // - si no, la mayor de las filas de SISTEMAS donde aparece.
    // capacidadCalculada guarda solo las calculadas: son las que usa el filtro.
    const capacidadCalculada = new Map<string, number>();

    for (const opcion of opciones.values()) {
      for (const equipo of opcion.equipos) {
        const kgTurno = kgTurnoPorId.get(equipo.id);

        if (horasCliente !== null && kgTurno !== undefined) {
          const capacidad = redondear((kgTurno * horasCliente) / HORAS_TURNO_REFERENCIA);
          equipo.capacidadReferenciaExcel = capacidad;
          capacidadCalculada.set(equipo.id, capacidad);
        } else {
          equipo.capacidadReferenciaExcel = capacidadPorEquipo.get(equipo.id) ?? null;
        }
      }
    }

    if (opciones.size > 0) {
      let ordenadas = Array.from(opciones.values()).sort(
        (a, b) => a.preferencia - b.preferencia || Math.min(...a.sistemas, 99) - Math.min(...b.sistemas, 99),
      );

      // Filtro por capacidad: solo si se conoce el volumen del cliente.
      if (volumenCliente !== null && capacidadCalculada.size > 0) {
        const filtro = filtrarPorCapacidad(ordenadas, volumenCliente, capacidadCalculada);

        if (filtro.descartadas.length > 0) {
          avisos.push({
            codigo: "filtrado_por_capacidad",
            mensaje: `Etapa "${etapa.nombre}": no pasan a la comparación ${filtro.descartadas.join(", ")} (no son el tamaño adecuado para ${volumenCliente} kg de harina por día con ${horasCliente} h de trabajo).`,
          });
        }

        ordenadas = filtro.opciones;
      }

      resultado.push({ etapa: etapa.nombre, orden: etapa.orden, tipo: etapa.tipo, opciones: ordenadas });
    } else if (habiaEquipos) {
      avisos.push({ codigo: "etapa_sin_candidatos", mensaje: `La etapa "${etapa.nombre}" tiene equipos en el Excel, pero ninguno con agente disponible.` });
    }
  }

  return { etapas: resultado, avisos };
}