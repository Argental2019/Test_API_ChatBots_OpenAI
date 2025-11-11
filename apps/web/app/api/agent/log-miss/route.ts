import { NextRequest, NextResponse } from "next/server";
import { Redis } from "@upstash/redis";
import crypto from "crypto";

export const runtime = "edge"; // opcional (Upstash soporta edge)

const redis = Redis.fromEnv();

function norm(s = "") {
  return s
    .toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { agentId, query, reason, need, ts, uiVersion, model, agentVersion } = body || {};
    if (!agentId || !query) {
      return NextResponse.json({ ok: false, error: "agentId y query son obligatorios" }, { status: 400 });
    }

    const when = ts ? new Date(ts) : new Date();
    const dateStr = when.toISOString().slice(0, 10).replace(/-/g, ""); // YYYYMMDD
    const id = crypto.randomUUID();

    // DEDUPE por día
    const dedupeKey = `miss:seen:${dateStr}`;
    const hash = crypto.createHash("sha1").update(`${agentId}|${norm(query)}`).digest("hex");
    const seen = await redis.sismember(dedupeKey, hash);
    if (!seen) {
      await redis.sadd(dedupeKey, hash);
      await redis.expire(dedupeKey, 60 * 60 * 24 * 8);
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

    await redis.hset(key, payload);
    await redis.lpush(`miss:index:${dateStr}`, key);
    await redis.expire(key, 60 * 60 * 24 * 180);

    return NextResponse.json({ ok: true, id, dateStr });
  } catch (e: any) {
    console.error("log-miss error", e);
    return NextResponse.json({ ok: false, error: "server_error" }, { status: 500 });
  }
}

// (Opcional) listado para dashboard rápido
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const dateStr = (searchParams.get("date") || new Date().toISOString().slice(0, 10).replace(/-/g, "")).toString();
  const limit = Number(searchParams.get("limit") || 200);
  const filterAgent = searchParams.get("agentId") || "";

  // auth simple opcional
  const expected = process.env.ADMIN_TOKEN;
  if (expected && req.headers.get("x-admin-token") !== expected) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  try {
    const keys = await redis.lrange(`miss:index:${dateStr}`, 0, limit - 1);
    const rows: any[] = [];
    for (const k of keys) {
      const obj = await redis.hgetall<Record<string, string | number>>(k);
      if (!obj) continue;
      if (filterAgent && obj.agentId !== filterAgent) continue;
      rows.push(obj);
    }
    rows.sort((a, b) => Number(b.ts) - Number(a.ts));
    return NextResponse.json({ ok: true, dateStr, count: rows.length, items: rows });
  } catch (e) {
    console.error("list-misses error", e);
    return NextResponse.json({ ok: false, error: "server_error" }, { status: 500 });
  }
}
