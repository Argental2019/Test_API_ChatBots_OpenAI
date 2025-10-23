import { kv } from '@vercel/kv';

/**
 * Genera una clave única para el caché basada en fileId y etag
 */
export function getCacheKey(fileId, etag) {
  return `file:${fileId}:${etag}`;
}

/**
 * Obtiene contenido del caché
 * @param {string} fileId - ID del archivo
 * @param {string} etag - ETag del archivo
 * @returns {Promise<string|null>} - Contenido o null si no existe
 */
export async function getFromCache(fileId, etag) {
  try {
    const key = getCacheKey(fileId, etag);
    const cached = await kv.get(key);
    return cached;
  } catch (error) {
    console.error('Error obteniendo del caché:', error);
    return null;
  }
}

/**
 * Guarda contenido en el caché
 * @param {string} fileId - ID del archivo
 * @param {string} etag - ETag del archivo
 * @param {string} content - Contenido a guardar
 * @param {number} ttl - Tiempo de vida en segundos (default: 7 días)
 */
export async function saveToCache(fileId, etag, content, ttl = 604800) {
  try {
    const key = getCacheKey(fileId, etag);
    await kv.set(key, content, { ex: ttl });
    return true;
  } catch (error) {
    console.error('Error guardando en caché:', error);
    return false;
  }
}

/**
 * Elimina una entrada del caché
 * @param {string} fileId - ID del archivo
 * @param {string} etag - ETag del archivo
 */
export async function deleteFromCache(fileId, etag) {
  try {
    const key = getCacheKey(fileId, etag);
    await kv.del(key);
    return true;
  } catch (error) {
    console.error('Error eliminando del caché:', error);
    return false;
  }
}