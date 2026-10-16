// apps/backend/advisor/sesion.js

// Tiempo de vida (en segundos) de las sesiones del asesor en Redis
// (claves advisor:sesion:<sessionId>).
//
// Cada vez que se guarda la sesión, el plazo vuelve a empezar, así que una
// conversación activa no se corta. Pasado este tiempo sin actividad, Redis
// la borra sola.
//
// Se puede cambiar desde el .env con ADVISOR_SESION_TTL (en segundos).
// Por defecto: 48 horas.
export const SESION_TTL_SEGUNDOS =
  Number(process.env.ADVISOR_SESION_TTL) || 48 * 60 * 60;