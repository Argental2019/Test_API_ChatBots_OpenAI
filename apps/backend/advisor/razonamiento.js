// Opciones de razonamiento para las llamadas a OpenAI.
//
// Lee del .env el nivel de razonamiento ("minimal", "low", "medium" o "high")
// y devuelve el parámetro listo para agregar al create(...).
// Si la variable no está, devuelve {} y la llamada queda igual que antes
// (el modelo usa su nivel por defecto).
//
// Se lee en cada llamada (no al importar) para que tome el .env ya cargado.

export function opcionesRazonamiento(variable) {
  const esfuerzo = String(process.env[variable] || "").trim();

  return esfuerzo ? { reasoning_effort: esfuerzo } : {};
}