// web/app/api/agent/log-miss/route.ts
import { NextRequest, NextResponse } from "next/server";
import { createClient, RedisClientType } from "redis";
import crypto from "node:crypto";

// IMPORTANT: usamos runtime Node para poder conectar por TCP a Redis Cloud
export const runtime = "nodejs";

// ---------- Cliente Redis (singleton) ---------- //

let _redis: RedisClientType | null = null;
let _redisReady = false;

async function getRedis(): Promise<RedisClientType> {
  if (_redis && _redisReady) return _redis;

  const url = process.env.REDIS_URL;
  if (!url) {
    throw new Error("REDIS_URL no está definido en las variables de entorno");
  }

  _redis = createClient({ url });

  _redis.on("error", (err) => {
    console.error("Redis Client Error", err);
  });

  if (!_redisReady) {
    await _redis.connect();
    _redisReady = true;
  }

  return _redis;
}

// ---------- Helpers ---------- //

function norm(s = "") {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function sha1Hex(input: string) {
  return crypto.createHash("sha1").update(input, "utf8").digest("hex");
}

// ---------- POST: registrar miss ---------- //

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { agentId, query, reason, need, ts, uiVersion, model, agentVersion } = body || {};

    if (!agentId || !query) {
      return NextResponse.json(
        { ok: false, error: "agentId y query son obligatorios" },
        { status: 400 }
      );
    }

    const redis = await getRedis();

    const when = ts ? new Date(ts) : new Date();
    const dateStr = when.toISOString().slice(0, 10).replace(/-/g, "");
    const id = crypto.randomUUID();

    // DEDUPE diario
    const dedupeKey = `miss:seen:${dateStr}`;
    const hash = sha1Hex(`${agentId}|${norm(query)}`);

    const seen = await redis.sIsMember(dedupeKey, hash);
    if (!seen) {
      await redis.sAdd(dedupeKey, hash);
      await redis.expire(dedupeKey, 60 * 60 * 24 * 8); // 8 días
    }

    const key = `miss:${dateStr}:${id}`;
    const payload = {
      id,
      agentId,
      query,
      reason: reason || "desconocido",
      need: need || "revisar_fuente",
      ts: when.getTime(),
      uiVersion: uiVersion || "unknown",
      model: model || "unknown",
      agentVersion: agentVersion || "unknown",
    };

    // hset: guardamos todas las propiedades en un hash
    await redis.hSet(key, payload as any);
    // índice del día
    await redis.lPush(`miss:index:${dateStr}`, key);
    // TTL de 180 días
    await redis.expire(key, 60 * 60 * 24 * 180);

    return NextResponse.json({ ok: true, id, dateStr });
  } catch (e) {
    console.error("log-miss error", e);
    return NextResponse.json({ ok: false, error: "server_error" }, { status: 500 });
  }
}

// ---------- GET: listar misses de un día ---------- //

export async function GET(req: NextRequest) {
  try {
    const redis = await getRedis();
    const { searchParams } = new URL(req.url);

    const dateStr =
      (searchParams.get("date") ||
        new Date().toISOString().slice(0, 10).replace(/-/g, "")) + "";

    const limit = Number(searchParams.get("limit") || 200);
    const filterAgent = searchParams.get("agentId") || "";

    // auth simple opcional
    const expected = process.env.ADMIN_TOKEN;
    if (expected && req.headers.get("x-admin-token") !== expected) {
      return NextResponse.json(
        { ok: false, error: "unauthorized" },
        { status: 401 }
      );
    }

    const keys = await redis.lRange(`miss:index:${dateStr}`, 0, limit - 1);

    const rows: any[] = [];
    for (const k of keys) {
      if (!k) continue;

      // hGetAll devuelve todo como string
      const obj = (await redis.hGetAll(k)) as Record<string, string>;
      if (!obj || Object.keys(obj).length === 0) continue;

      // Normalizamos: ts en número, resto queda como string
      const normalized: any = {
        ...obj,
        ts: obj.ts ? Number(obj.ts) : undefined,
      };

      if (filterAgent && normalized.agentId !== filterAgent) continue;
      rows.push(normalized);
    }

    rows.sort((a, b) => Number(b.ts || 0) - Number(a.ts || 0));

    return NextResponse.json({
      ok: true,
      dateStr,
      count: rows.length,
      items: rows,
    });
  } catch (e) {
    console.error("list-misses error", e);
    return NextResponse.json({ ok: false, error: "server_error" }, { status: 500 });
  }
}
