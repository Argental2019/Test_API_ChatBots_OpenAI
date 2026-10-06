// =============================================================================
// Funciones comunes de los endpoints de preparación del asesor (servidor).
// - Acceso: header x-admin-token contra ADMIN_TOKEN.
// - URL del backend Express.
// - Carpetas de Drive que no se envían a los prompts (Info pública general).
// - Lectura del Excel desde el backend, ya interpretado como catálogo.
// =============================================================================

import { leerCatalogo } from "../excel/leercatalogo";
import type { Catalogo, LibroExcel } from "../excel/types";

/**
 * Verifica el token de administrador. Devuelve un mensaje de error, o null si
 * el acceso es válido. Si ADMIN_TOKEN no está configurado, rechaza siempre:
 * estos endpoints llaman a OpenAI y no pueden quedar abiertos.
 */
export function errorDeAcceso(req: Request): { status: number; mensaje: string } | null {
  const token = process.env.ADMIN_TOKEN;
  if (!token) return { status: 500, mensaje: "Falta la variable de entorno ADMIN_TOKEN." };
  if (req.headers.get("x-admin-token") !== token) return { status: 401, mensaje: "No autorizado." };
  return null;
}

/** URL del backend Express, con las mismas variables que ya usa el proyecto. */
export function urlBackend(): string | null {
  const url = process.env.BACKEND_URL || process.env.BACKEND_BASE_URL || process.env.NEXT_PUBLIC_BACKEND_URL;
  return url ? url.replace(/\/+$/, "") : null;
}

/** Carpetas que no se envían a los prompts (separadas por coma). */
export function carpetasExcluidas(): string[] {
  return (process.env.ADVISOR_CARPETAS_EXCLUIDAS || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

/** Lee el Excel desde el backend y lo devuelve interpretado. */
export async function catalogoDesdeBackend(backend: string): Promise<Catalogo> {
  const resp = await fetch(`${backend}/advisor/excel`, { cache: "no-store" });
  if (!resp.ok) throw new Error(`El backend no pudo devolver el Excel (${resp.status}): ${await resp.text()}`);
  return leerCatalogo((await resp.json()) as LibroExcel);
}