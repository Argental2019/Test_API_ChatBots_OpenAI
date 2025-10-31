// utils/cache.js
import dotenv from "dotenv";
dotenv.config();

let provider = "memory";
let client = null;

// 1) Vercel KV (si hay credenciales válidas)
try {
  if (process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN) {
    const kvModule = await import("@vercel/kv");
    client = kvModule.kv; // Vercel expone un cliente ya configurado
    provider = "vercel-kv";
  }
} catch { /* ignore */ }

// 2) Redis clásico (si hay REDIS_URL)
if (!client && process.env.REDIS_URL) {
  const { default: IORedis } = await import("ioredis");
  client = new IORedis(process.env.REDIS_URL, {
    maxRetriesPerRequest: 2,
    enableReadyCheck: true,
  });
  provider = "redis";
}

// 3) Fallback en memoria
const memory = new Map();

const toSec = (ms) => Math.max(1, Math.floor(ms / 1000));

export async function cacheGet(key) {
  if (provider === "vercel-kv") {
    return await client.get(key);
  }
  if (provider === "redis") {
    const v = await client.get(key);
    return v ? JSON.parse(v) : null;
  }
  // memory
  return memory.get(key) ?? null;
}

export async function cacheSet(key, value, ttlMs = 1000 * 60 * 60 * 24) {
  if (provider === "vercel-kv") {
    // @vercel/kv admite EX (segundos)
    await client.set(key, JSON.stringify(value), { ex: toSec(ttlMs) });
    return;
  }
  if (provider === "redis") {
    await client.set(key, JSON.stringify(value), "PX", ttlMs);
    return;
  }
  // memory
  memory.set(key, value);
  // TTL básico en memoria
  setTimeout(() => memory.delete(key), ttlMs).unref?.();
}

export async function cacheDel(key) {
  if (provider === "vercel-kv") {
    await client.del(key);
    return;
  }
  if (provider === "redis") {
    await client.del(key);
    return;
  }
  memory.delete(key);
}

export function cacheInfo() {
  return { provider };
}
