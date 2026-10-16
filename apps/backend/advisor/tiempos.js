// apps/backend/advisor/tiempos.js
//
// Registro de tiempos del Asesor Integral.
//
// Agrega una línea por paso a un archivo de texto, para ver qué parte del
// proceso tarda más. El web (route.ts) escribe en el mismo archivo.
//
// Solo escribe si en el .env está ADVISOR_TIEMPOS_ARCHIVO con la ruta del
// archivo. Si no está (por ejemplo en Vercel), no hace nada.
//
// Nunca corta el flujo: si no puede escribir, solo avisa en consola.

import { appendFile } from "fs/promises";

/** Fecha y hora local con milisegundos: 2026-10-15 11:52:03.120 */
function fechaHora() {
  const d = new Date();
  const dos = (n) => String(n).padStart(2, "0");

  return (
    `${d.getFullYear()}-${dos(d.getMonth() + 1)}-${dos(d.getDate())} ` +
    `${dos(d.getHours())}:${dos(d.getMinutes())}:${dos(d.getSeconds())}.` +
    String(d.getMilliseconds()).padStart(3, "0")
  );
}

/**
 * Registra cuánto tardó un paso.
 *
 * - sessionId: la sesión del asesor (se muestran los primeros 8 caracteres).
 * - paso: nombre del paso, por ejemplo "Prompt 3".
 * - inicio: el Date.now() tomado al empezar el paso.
 * - detalle: texto opcional (por ejemplo, la etapa del Prompt 5).
 */
export function registrarTiempo(sessionId, paso, inicio, detalle = "") {
  const archivo = process.env.ADVISOR_TIEMPOS_ARCHIVO;

  if (!archivo) {
    return;
  }

  const ms = Date.now() - inicio;

  const linea =
    [
      fechaHora(),
      String(sessionId || "-").slice(0, 8).padEnd(8),
      "backend".padEnd(7),
      String(paso).padEnd(34),
      `${String(ms).padStart(7)} ms`,
      detalle,
    ].join(" | ") + "\n";

  appendFile(archivo, linea, "utf8").catch((error) => {
    console.warn("[tiempos] no se pudo escribir el archivo:", error?.message);
  });
}