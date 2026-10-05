// =============================================================================
// Lee el Excel SISTEMAS_PRODUCTIVOS (ya convertido en matrices por el backend)
// y lo transforma en un Catalogo: etapas del proceso, filas por producto y
// equipos con su ID Busquetti y su marca.
//
// Principio: el código no conoce productos ni equipos. Todo sale del Excel.
// Las columnas se buscan por el texto de su encabezado, no por su posición,
// para que agregar o mover columnas no rompa la lectura.
// =============================================================================

import type {
  Aviso,
  Catalogo,
  Celda,
  EquipoCatalogo,
  EtapaProceso,
  FilaSistema,
  HojaExcel,
  LibroExcel,
} from "./types";

// Nombres de hoja y de encabezados que el código espera encontrar.
// Si el equipo comercial los renombra, se cambian acá (un solo lugar).
export const CONFIG_EXCEL = {
  hojaSistemas: "SISTEMAS",
  hojaEquipos: "COD LISPRE",
  sistemas: {
    nro: "NRO",
    nombre: "NOMBRE",
    producto: "PRODUCTO",
    consumo: "KG/DIA", // el encabezado real es "kg/dia " (se compara normalizado)
  },
equipos: {
  cod: "COD_LISPRE",
  nombreComercial: "NOMBRE COMERCIAL DEL PRODUCTO",
  idBusquetti: "ID BUSQUETTI",
  marca: "MARCA",
  tipoEquipo: "TIPO DE EQUIPO",
},

  // Un grupo cuyo título contiene esta palabra es de alternativas (se elige uno).
  palabraAlternativas: "ALTERNATIVA",
  // Una etapa cuyo nombre contiene esto es la de congelado.
  palabraCongelado: "CONGELAD",
  // Cuántas filas iniciales se revisan para encontrar la fila de encabezados.
  filasParaBuscarEncabezado: 10,
} as const;

// ----------------------------- Utilidades -----------------------------------

/**
 * Normaliza un texto para comparar: sin tildes, en mayúsculas, sin espacios
 * sobrantes. Se usa solo para comparar; lo que se muestra conserva el original.
 * Ejemplo: " Bolleria  " y "BOLLERÍA" quedan iguales.
 */
export function normalizar(valor: Celda | undefined): string {
  if (valor === null || valor === undefined) return "";
  return String(valor)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/\s+/g, " ")
    .trim();
}

/** Texto para mostrar: el original, sin espacios sobrantes. */
function limpiar(valor: Celda | undefined): string {
  if (valor === null || valor === undefined) return "";
  return String(valor).replace(/\s+/g, " ").trim();
}

/** Detecta valores de error de Excel (#REF!, #N/A, etc.). */
function esErrorExcel(valor: Celda | undefined): boolean {
  return typeof valor === "string" && /^#(REF!|N\/A|VALUE!|DIV\/0!|NAME\?|NUM!|NULL!)/.test(valor.trim());
}

/** Convierte una celda en número, o null si no lo es. */
function aNumero(valor: Celda | undefined): number | null {
  if (typeof valor === "number" && Number.isFinite(valor)) return valor;
  if (typeof valor === "string") {
    const n = Number(valor.replace(",", ".").trim());
    return valor.trim() !== "" && Number.isFinite(n) ? n : null;
  }
  return null;
}

/** Letra de columna de Excel a partir del índice base 0 (0 → A, 27 → AB). */
function letraColumna(indice: number): string {
  let s = "";
  let n = indice + 1;
  while (n > 0) {
    const resto = (n - 1) % 26;
    s = String.fromCharCode(65 + resto) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

/**
 * Busca la fila de encabezados: la primera fila (entre las iniciales) que
 * contiene todos los textos pedidos. Devuelve su índice (base 0) o -1.
 */
function buscarFilaEncabezado(hoja: HojaExcel, requeridos: string[]): number {
  const limite = Math.min(hoja.filas.length, CONFIG_EXCEL.filasParaBuscarEncabezado);
  for (let r = 0; r < limite; r++) {
    const textos = (hoja.filas[r] ?? []).map(normalizar);
    if (requeridos.every((req) => textos.some((t) => t === req || t.startsWith(req)))) return r;
  }
  return -1;
}

/** Índice de la columna cuyo encabezado coincide (o empieza) con el texto pedido. */
function buscarColumna(encabezados: Celda[], texto: string): number {
  const textos = encabezados.map(normalizar);
  const exacta = textos.indexOf(texto);
  if (exacta >= 0) return exacta;
  return textos.findIndex((t) => t.startsWith(texto));
}

// -------------------------- Hoja SISTEMAS -----------------------------------

/**
 * Arma las etapas del proceso a partir de los encabezados:
 * - La fila de títulos (la anterior a la de encabezados) tiene los nombres de
 *   grupo, a veces en celdas combinadas que abarcan varias columnas.
 * - Si una columna no tiene título de grupo (por ejemplo, la de fermentación),
 *   el nombre de la etapa sale de su propio encabezado.
 */
function leerEtapas(
  hoja: HojaExcel,
  filaTitulos: number,
  filaEncabezado: number,
  primeraColumnaEquipos: number,
  avisos: Aviso[],
): EtapaProceso[] {
  const encabezados = hoja.filas[filaEncabezado] ?? [];
  const titulos = hoja.filas[filaTitulos] ?? [];
  const grupos = new Map<number, { titulo: string; columnas: number[] }>();

  for (let c = primeraColumnaEquipos; c < encabezados.length; c++) {
    if (limpiar(encabezados[c]) === "") continue; // columna sin encabezado: no es de equipos

    // ¿La columna está dentro de una celda combinada de la fila de títulos?
    const combinada = hoja.combinadas.find(
      (m) => m.s.r <= filaTitulos && m.e.r >= filaTitulos && m.s.c <= c && m.e.c >= c,
    );
    const inicio = combinada ? combinada.s.c : c;
    const titulo = limpiar(titulos[inicio]) || limpiar(encabezados[c]);

    const grupo = grupos.get(inicio) ?? { titulo, columnas: [] };
    grupo.columnas.push(c);
    grupos.set(inicio, grupo);
  }

  const etapas: EtapaProceso[] = [];
  let orden = 1;
  for (const [, grupo] of Array.from(grupos.entries()).sort((a, b) => a[0] - b[0])) {
    const tituloNormal = normalizar(grupo.titulo);
    // Se saca el prefijo "ALTERNATIVA(S) (DE)" para que el nombre de la etapa sea limpio.
    const nombre = limpiar(grupo.titulo.replace(/^\s*alternativas?\s+(de\s+)?/i, "")) || grupo.titulo;
    const esAlternativa =
                        tituloNormal.includes(CONFIG_EXCEL.palabraAlternativas);

    etapas.push({
      nombre,
      orden: orden++,
      tipo: esAlternativa ? "alternativas" : "conjunto",
      columnas: grupo.columnas,
      esCongelado: normalizar(nombre).includes(CONFIG_EXCEL.palabraCongelado),
    });
  }

  if (etapas.length === 0) {
    avisos.push({ codigo: "sin_etapas", mensaje: "No se encontraron columnas de equipos en la hoja SISTEMAS.", hoja: CONFIG_EXCEL.hojaSistemas });
  }
  return etapas;
}

function leerSistemas(hoja: HojaExcel, avisos: Aviso[]) {
  const cfg = CONFIG_EXCEL.sistemas;
  const filaEncabezado = buscarFilaEncabezado(hoja, [cfg.nro, cfg.producto]);
  if (filaEncabezado < 1) {
    avisos.push({ codigo: "encabezado_no_encontrado", mensaje: "No se encontró la fila de encabezados de la hoja SISTEMAS (NRO, Producto).", hoja: CONFIG_EXCEL.hojaSistemas });
    return { etapas: [] as EtapaProceso[], filas: [] as FilaSistema[] };
  }

  const encabezados = hoja.filas[filaEncabezado];
  const colNro = buscarColumna(encabezados, cfg.nro);
  const colNombre = buscarColumna(encabezados, cfg.nombre);
  const colProducto = buscarColumna(encabezados, cfg.producto);
  const colConsumo = buscarColumna(encabezados, cfg.consumo);
  if (colConsumo < 0) {
    avisos.push({ codigo: "columna_no_encontrada", mensaje: `No se encontró la columna "${cfg.consumo}" en la hoja SISTEMAS.`, hoja: CONFIG_EXCEL.hojaSistemas });
  }

  // Las columnas de equipos empiezan después de la última columna de datos del sistema.
  const primeraColumnaEquipos = Math.max(colNro, colNombre, colProducto, colConsumo) + 1;
  const etapas = leerEtapas(hoja, filaEncabezado - 1, filaEncabezado, primeraColumnaEquipos, avisos);

  const filas: FilaSistema[] = [];
  for (let r = filaEncabezado + 1; r < hoja.filas.length; r++) {
    const fila = hoja.filas[r] ?? [];
    const producto = limpiar(fila[colProducto]);
    if (producto === "") continue; // fila vacía o separadora

    const equiposPorEtapa: Record<string, string[]> = {};
    for (const etapa of etapas) {
      const nombres: string[] = [];
      for (const c of etapa.columnas) {
        const valor = fila[c];
        if (esErrorExcel(valor)) {
          avisos.push({
            codigo: "celda_con_error",
            mensaje: `La celda ${letraColumna(c)}${r + 1} tiene un error de Excel (${limpiar(valor)}) y se ignora.`,
            hoja: CONFIG_EXCEL.hojaSistemas,
            fila: r + 1,
          });
          continue;
        }
        const nombre = limpiar(valor);
        // Se ignoran celdas vacías y equipos repetidos dentro de la misma celda de grupo.
        if (nombre !== "" && !nombres.some((n) => normalizar(n) === normalizar(nombre))) nombres.push(nombre);
      }
      if (nombres.length > 0) equiposPorEtapa[etapa.nombre] = nombres;
    }

    filas.push({
      filaExcel: r + 1,
      sistema: aNumero(fila[colNro]),
      nombreSistema: limpiar(fila[colNombre]),
      producto,
      consumoMaxKgDia: colConsumo >= 0 ? aNumero(fila[colConsumo]) : null,
      equiposPorEtapa,
    });
  }
  return { etapas, filas };
}

// -------------------------- Hoja COD LISPRE ---------------------------------

function leerEquipos(hoja: HojaExcel, avisos: Aviso[]): Record<string, EquipoCatalogo> {
  const cfg = CONFIG_EXCEL.equipos;
  const filaEncabezado = buscarFilaEncabezado(hoja, [cfg.cod, cfg.nombreComercial]);
  if (filaEncabezado < 0) {
    avisos.push({ codigo: "encabezado_no_encontrado", mensaje: "No se encontró la fila de encabezados de la hoja COD LISPRE.", hoja: CONFIG_EXCEL.hojaEquipos });
    return {};
  }

const encabezados = hoja.filas[filaEncabezado];
const colId = buscarColumna(encabezados, cfg.idBusquetti);
const colCod = buscarColumna(encabezados, cfg.cod);
const colNombre = buscarColumna(encabezados, cfg.nombreComercial);
const colMarca = buscarColumna(encabezados, cfg.marca);
const colTipo = buscarColumna(encabezados, cfg.tipoEquipo);


  if (colMarca < 0) avisos.push({ codigo: "columna_no_encontrada", mensaje: 'Falta la columna "Marca" en COD LISPRE.', hoja: CONFIG_EXCEL.hojaEquipos });
  if (colTipo < 0) avisos.push({ codigo: "columna_no_encontrada", mensaje: 'Falta la columna "Tipo de equipo" en COD LISPRE (necesaria para generar esquemas y fichas).', hoja: CONFIG_EXCEL.hojaEquipos });

  const equipos: Record<string, EquipoCatalogo> = {};
  for (let r = filaEncabezado + 1; r < hoja.filas.length; r++) {
    const fila = hoja.filas[r] ?? [];
    const nombreComercial = limpiar(fila[colNombre]);
    if (nombreComercial === "") continue;

    const clave = normalizar(nombreComercial);
    if (equipos[clave]) {
      avisos.push({ codigo: "equipo_repetido", mensaje: `"${nombreComercial}" aparece más de una vez en COD LISPRE; se usa la primera fila.`, hoja: CONFIG_EXCEL.hojaEquipos, fila: r + 1 });
      continue;
    }
    const codLispre = limpiar(fila[colCod]);

equipos[clave] = {
  nombreComercial,
  codLispre,
  idBusquetti:
    colId >= 0
      ? limpiar(fila[colId]) || null
      : null,
  marca:
    colMarca >= 0
      ? limpiar(fila[colMarca]) || null
      : null,
  tipoEquipo:
    colTipo >= 0
      ? limpiar(fila[colTipo]) || null
      : null,
};
  }
  return equipos;
}

// ------------------------------ Principal -----------------------------------

/**
 * Lee el libro completo y devuelve el catálogo con sus avisos.
 * Los avisos no detienen la lectura: describen lo que conviene corregir en el
 * Excel (celdas con error, equipos sin ID, nombres que no cruzan entre hojas).
 */
export function leerCatalogo(libro: LibroExcel): Catalogo {
  const avisos: Aviso[] = [];
  const hojaSistemas = libro.hojas[CONFIG_EXCEL.hojaSistemas];
  const hojaEquipos = libro.hojas[CONFIG_EXCEL.hojaEquipos];

  if (!hojaSistemas) avisos.push({ codigo: "hoja_no_encontrada", mensaje: `No existe la hoja "${CONFIG_EXCEL.hojaSistemas}".` });
  if (!hojaEquipos) avisos.push({ codigo: "hoja_no_encontrada", mensaje: `No existe la hoja "${CONFIG_EXCEL.hojaEquipos}".` });

  const { etapas, filas } = hojaSistemas ? leerSistemas(hojaSistemas, avisos) : { etapas: [], filas: [] };
  const equipos = hojaEquipos ? leerEquipos(hojaEquipos, avisos) : {};

  // Cruce entre hojas: cada equipo de SISTEMAS tiene que existir en COD LISPRE y tener ID.
  const revisados = new Set<string>();
  for (const fila of filas) {
    for (const nombres of Object.values(fila.equiposPorEtapa)) {
      for (const nombre of nombres) {
        const clave = normalizar(nombre);
        if (revisados.has(clave)) continue;
        revisados.add(clave);
        const equipo = equipos[clave];
        if (!equipo) {
          avisos.push({ codigo: "equipo_sin_fila_cod_lispre", mensaje: `"${nombre}" (hoja SISTEMAS) no tiene fila en COD LISPRE con ese nombre comercial.`, hoja: CONFIG_EXCEL.hojaSistemas, fila: fila.filaExcel });
        } else if (!equipo.idBusquetti) {
  avisos.push({
    codigo: "equipo_sin_cod_lispre",
    mensaje: `"${nombre}" no tiene COD_LISPRE: no puede identificarse dentro de Busquetti y se saltea.`,
    hoja: CONFIG_EXCEL.hojaEquipos,
  });
}
      }
    }
  }

  // Productos válidos: sin repetidos (el Excel tiene, por ejemplo, "BOLLERIA" y "BOLLERIA ").
  const productos: string[] = [];
  for (const fila of filas) {
    if (!productos.some((p) => normalizar(p) === normalizar(fila.producto))) productos.push(fila.producto);
  }

  const consumos = filas.map((f) => f.consumoMaxKgDia).filter((n): n is number => n !== null);
  const topeKgHarinaDia = consumos.length > 0 ? Math.max(...consumos) : null;

  return { version: libro.version, etapas, filas, productos, topeKgHarinaDia, equipos, avisos };
}

/** Nombres de las etapas del proceso, para {{etapas_validas}}. */
export function etapasValidas(catalogo: Catalogo): string[] {
  return catalogo.etapas.map((e) => e.nombre);
}