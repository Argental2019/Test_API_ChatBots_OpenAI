// =============================================================================
// Tipos del catálogo (Excel SISTEMAS_PRODUCTIVOS) y de los candidatos.
// Estos tipos son el "contrato" entre el backend (que lee el .xlsx de Drive),
// el armado de candidatos (etapa 2) y los prompts que vienen después.
// =============================================================================

/** Valor de una celda tal como lo entrega el backend. */
export type Celda = string | number | boolean | null;

/**
 * Rango de celdas combinadas, en el mismo formato que usa SheetJS:
 * índices base 0 (fila 0 = fila 1 del Excel, columna 0 = columna A).
 */
export interface RangoCombinado {
  s: { r: number; c: number }; // inicio (start)
  e: { r: number; c: number }; // fin (end)
}

/** Una hoja del Excel: la matriz de celdas y sus celdas combinadas. */
export interface HojaExcel {
  filas: Celda[][];
  combinadas: RangoCombinado[];
}

/** El libro completo, como lo devuelve el endpoint del backend. */
export interface LibroExcel {
  version: string; // identifica la versión del archivo en Drive (para caché y sesión)
  hojas: Record<string, HojaExcel>;
}

/** Aviso de validación: algo del Excel que conviene revisar. No corta el flujo. */
export interface Aviso {
  codigo: string;
  mensaje: string;
  hoja?: string;
  fila?: number; // número de fila del Excel (base 1), para que sea fácil de encontrar
}

/**
 * "alternativas": se elige uno de los equipos del grupo.
 * "conjunto": los equipos de una fila van todos juntos.
 */
export type TipoGrupo = "alternativas" | "conjunto";

/** Una etapa del proceso = un grupo de columnas de la hoja SISTEMAS. */
export interface EtapaProceso {
  nombre: string; // por ejemplo, "PREPARACION DE MASA (AMASADO/BATIDO)"
  orden: number; // posición en el proceso (orden de las columnas)
  tipo: TipoGrupo;
  columnas: number[]; // índices de columna (base 0) que forman el grupo
  esCongelado: boolean; // se excluye si el cliente no congela
}

/** Una fila de la hoja SISTEMAS: un producto dentro de un sistema productivo. */
export interface FilaSistema {
  filaExcel: number; // base 1
  sistema: number | null;
  nombreSistema: string;
  producto: string; // tal como figura en el Excel, sin espacios sobrantes
  consumoMaxKgDia: number | null;
  /** Por nombre de etapa, los nombres comerciales en el orden de las columnas. */
  equiposPorEtapa: Record<string, string[]>;
}

/** Un equipo de la hoja COD LISPRE. */
export interface EquipoCatalogo {
  nombreComercial: string;
  codLispre: string;

  // El ID Busquetti es el COD_LISPRE.
  idBusquetti: string | null;

  marca: string | null;
  tipoEquipo: string | null;
}
/** Todo lo que el sistema necesita del Excel, ya interpretado. */
export interface Catalogo {
  version: string;
  etapas: EtapaProceso[];
  filas: FilaSistema[];
  productos: string[]; // lista de productos válidos (sin repetidos)
  topeKgHarinaDia: number | null; // mayor consumo de harina de la hoja SISTEMAS
  /** Clave: nombre comercial normalizado (ver normalizar()). */
  equipos: Record<string, EquipoCatalogo>;
  avisos: Aviso[];
}

// ----------------------------- Candidatos -----------------------------------

/** Datos de búsqueda que devuelve el prompt de extracción (prompt 3). */
export interface Busqueda {
  productos: string[];
  productos_no_disponibles: string[];
  etapas_cubiertas: string[];
  congela: boolean | null;
}
/** Un equipo dentro de una opción candidata. */
export interface EquipoOpcion {
  id: string; // ID Busquetti
  nombreComercial: string;
  marca: string | null;
  tipoEquipo: string | null;
}

/** Una opción de una etapa: un equipo solo, o un conjunto que va junto. */
export interface OpcionCandidata {
  clave: string; // identificador estable de la opción (ID, o IDs unidos con "+")
  tipo: "individual" | "conjunto";
  equipos: EquipoOpcion[];
  preferencia: number; // 1 = primera columna del grupo en el Excel
  sistemas: number[]; // sistemas del Excel donde aparece
  productos: string[]; // productos del cliente que atiende (para el volumen a cubrir)
}

export interface EtapaCandidatos {
  etapa: string;
  orden: number;
  tipo: TipoGrupo;
  opciones: OpcionCandidata[];
}

export interface ResultadoCandidatos {
  etapas: EtapaCandidatos[];
  avisos: Aviso[];
}