// index.js — Vercel-ready (Express export, lazy init, async safety)

import express from "express";
import dotenv from "dotenv";
import crypto from "crypto";
import pLimit from "p-limit";
import Redis from "ioredis";
import { google } from "googleapis";

// ⤵️ tu extractor
import { extractTextFromBuffer } from "./utils/extractText.js";

dotenv.config();

const app = express();
const port = process.env.PORT || 3000;
app.use(express.json({ limit: "10mb" }));

/* ============ Utilidades generales ============ */
const METRICS = { counts: {}, durs: {} };
const pct = (arr, p) => (arr.length ? [...arr].sort((a,b)=>a-b)[Math.floor((p/100)*(arr.length-1))] : 0);
const metricsSnapshot = () => Object.fromEntries(
  Object.keys(METRICS.counts).map(k => {
    const arr = METRICS.durs[k] || [];
    return [k, { count: METRICS.counts[k], p50: pct(arr,50), p95: pct(arr,95), p99: pct(arr,99) }];
  })
);
const withTimer = (name, fn) => async (req, res, next) => {
  const t0 = Date.now();
  METRICS.counts[name] = (METRICS.counts[name] || 0) + 1;
  try { await fn(req, res, next); }
  finally {
    const dt = Date.now() - t0;
    const arr = (METRICS.durs[name] ||= []);
    arr.push(dt);
    if (arr.length > 500) arr.shift();
  }
};
const asyncHandler = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

const makeEtag = (payload) => crypto.createHash("md5").update(payload).digest("hex");

/* Helpers de tamaño/recorte */
const truncate = (str, n) => {
  if (!str) return "";
  if (str.length <= n) return str;
  return str.slice(0, n) + " …";
};
const approxBytes = (obj) => {
  try { return Buffer.byteLength(JSON.stringify(obj), "utf8"); }
  catch { return 0; }
};

/* Topes seguros para evitar respuestas gigantes en Actions */
const DEFAULT_MODE = "snippet";         // meta | snippet | full
const MAX_FILES_BULK = 3;               // máx archivos por bulkRead
const PER_FILE_LIMIT = 3000;            // chars por archivo (snippet)
const MAX_RESPONSE_BYTES = 800_000;     // ~0.8MB payload total (seguro para Actions)

/* ============ Cache (Redis opcional) ============ */
const mem = new Map();
let redis = null;
if (process.env.REDIS_URL) {
  redis = new Redis(process.env.REDIS_URL, { lazyConnect: true, maxRetriesPerRequest: 2 });
  redis.on("error", (e) => console.error("Redis error:", e.message));
}
const cacheGet = async (k) => {
  if (redis) {
    const raw = await redis.get(k);
    return raw ? JSON.parse(raw) : null;
  }
  return mem.get(k) || null;
};
const cacheSet = async (k, v, ttl = 86400) => (redis ? redis.set(k, JSON.stringify(v), "EX", ttl) : mem.set(k, v));

/* ============ Google OAuth/Drive (init perezoso) ============ */
function requireEnvs(keys) {
  const missing = keys.filter(k => !process.env[k]);
  if (missing.length) {
    const msg = `Missing ENVs: ${missing.join(", ")}`;
    const err = new Error(msg);
    err.status = 500;
    throw err;
  }
}
function createOAuth2Client() {
  requireEnvs(["GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET", "REDIRECT_URI"]);
  const oAuth2 = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.REDIRECT_URI
  );
  if (process.env.REFRESH_TOKEN) {
    oAuth2.setCredentials({ refresh_token: process.env.REFRESH_TOKEN });
  }
  return oAuth2;
}
function getDrive() {
  requireEnvs(["GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET", "REDIRECT_URI", "REFRESH_TOKEN"]);
  const auth = createOAuth2Client();
  return google.drive({ version: "v3", auth });
}

/* ============ Helpers Drive ============ */
async function getFileMeta(fileId) {
  const drive = getDrive();
  const fields = "id,name,mimeType,modifiedTime,md5Checksum,size";
  const { data } = await drive.files.get({ fileId, fields });
  return {
    id: data.id,
    name: data.name,
    mimeType: data.mimeType,
    size: data.size,
    modifiedTime: data.modifiedTime,
    etag: data.md5Checksum || data.modifiedTime,
  };
}
async function getManifest(folderId) {
  const drive = getDrive();
  const q = `'${folderId}' in parents and trashed = false`;
  const fields = "files(id,name,mimeType,modifiedTime,md5Checksum,size)";
  const { data } = await drive.files.list({ q, pageSize: 1000, fields });
  return {
    folderId,
    generatedAt: new Date().toISOString(),
    files: (data.files || []).map(f => ({
      id: f.id,
      name: f.name,
      mimeType: f.mimeType,
      size: f.size,
      modifiedTime: f.modifiedTime,
      md5Checksum: f.md5Checksum,
      etag: f.md5Checksum || f.modifiedTime
    }))
  };
}
async function getFileBinary(fileId, mimeType) {
  const drive = getDrive();
  const isGoogleDoc = (mimeType || "").startsWith("application/vnd.google-apps");
  if (isGoogleDoc) {
    const { data } = await drive.files.export(
      { fileId, mimeType: "text/plain" },
      { responseType: "arraybuffer" }
    );
    return Buffer.from(data);
  }
  const { data } = await drive.files.get(
    { fileId, alt: "media" },
    { responseType: "arraybuffer" }
  );
  return Buffer.from(data);
}

/* ============ Endpoints ============ */

// Ping raíz
app.get("/", (req, res) => res.status(200).send("✅ Google Drive API backend (Vercel-ready)"));

// Listado básico
app.get("/drive/list", withTimer("list", asyncHandler(async (req, res) => {
  const folderId = req.query.folderId;
  if (!folderId) return res.status(400).json({ error: "Falta folderId" });

  const drive = getDrive();
  const { data } = await drive.files.list({
    q: `'${folderId}' in parents and trashed = false`,
    fields: "files(id,name,mimeType)"
  });
  return res.status(200).json({ files: data.files || [] });
})));

// Manifest
app.get("/drive/manifest", withTimer("manifest", asyncHandler(async (req, res) => {
  const folderId = req.query.folderId;
  if (!folderId) return res.status(400).json({ error: "Falta folderId" });

  const manifest = await getManifest(folderId);
  const etag = makeEtag(JSON.stringify({ folderId, etags: manifest.files.map(f => f.etag) }));
  if (req.headers["if-none-match"] === etag) return res.status(304).end();

  res.setHeader("ETag", etag);
  res.setHeader("Cache-Control", "public, max-age=60");
  return res.status(200).json(manifest);
})));

// Leer archivo con caché + control de tamaño
// GET /drive/read?fileId=...&mode=snippet|full&limitChars=3000
app.get("/drive/read", withTimer("read", asyncHandler(async (req, res) => {
  const fileId = req.query.fileId;
  if (!fileId) return res.status(400).json({ error: "Falta fileId" });

  const mode = (req.query.mode || DEFAULT_MODE).toLowerCase(); // snippet | full
  const limitChars = Math.max(500, Math.min(parseInt(req.query.limitChars || `${PER_FILE_LIMIT}`, 10), 20000));

  const meta = await getFileMeta(fileId);
  const cacheKey = `${fileId}:${meta.etag}`;
  const hit = await cacheGet(cacheKey);
  if (hit) {
    const content = mode === "full" ? hit.content : truncate(hit.content, limitChars);
    return res.status(200).json({ ...hit, content, mode, limitChars, cached: true });
  }

  const buffer = await getFileBinary(fileId, meta.mimeType);
  const contentRaw = await extractTextFromBuffer(buffer, meta.mimeType);
  const payload = {
    fileId: meta.id,
    name: meta.name,
    mimeType: meta.mimeType,
    etag: meta.etag,
    size: buffer.length,
    content: contentRaw
  };
  await cacheSet(cacheKey, payload);

  const content = mode === "full" ? payload.content : truncate(payload.content, limitChars);
  return res.status(200).json({ ...payload, content, mode, limitChars, cached: false });
})));

// Leer rango PDF
app.get("/drive/readRange", withTimer("readRange", asyncHandler(async (req, res) => {
  const { fileId } = req.query;
  const fromPage = Number(req.query.fromPage ?? 1);
  const toPage = Number(req.query.toPage ?? fromPage);

  if (!fileId) return res.status(400).json({ error: "Falta fileId" });

  const meta = await getFileMeta(fileId);
  if (!/pdf/i.test(meta.mimeType || meta.name)) {
    return res.status(400).json({ error: "readRange solo soporta PDFs" });
  }

  const buffer = await getFileBinary(fileId, meta.mimeType);
  const content = await extractTextFromBuffer(buffer, meta.mimeType, { fromPage, toPage });

  const payload = {
    fileId: meta.id,
    name: meta.name,
    mimeType: meta.mimeType,
    etag: meta.etag,
    requestedRange: { fromPage, toPage },
    content
  };
  return res.status(200).json(payload);
})));

// NUEVO: Paquete consolidado (bundle) para 1 sola llamada desde el GPT
// GET /drive/bundle?folderId=...&maxChars=120000
app.get("/drive/bundle", withTimer("bundle", asyncHandler(async (req, res) => {
  const folderId = req.query.folderId;
  const maxChars = Math.max(20_000, Math.min(parseInt(req.query.maxChars || "120000", 10), 400_000));
  if (!folderId) return res.status(400).json({ error: "Falta folderId" });

  // 1) Manifest (ids + etags)
  const manifest = await getManifest(folderId);

  // ETag condicional: si nada cambió, devolvemos 304
  const etag = makeEtag(JSON.stringify({ folderId, etags: manifest.files.map(f => f.etag) }));
  if (req.headers["if-none-match"] === etag) return res.status(304).end();

  // 2) Lee en paralelo usando caché
  const limit = pLimit(Number(process.env.MAX_CONCURRENCY || 6));
  const settled = await Promise.allSettled(
    manifest.files.map(f => limit(async () => {
      const cacheKey = `${f.id}:${f.etag}`;
      const hit = await cacheGet(cacheKey);
      if (hit) return hit;

      const buffer = await getFileBinary(f.id, f.mimeType);
      const content = await extractTextFromBuffer(buffer, f.mimeType);
      const payload = {
        fileId: f.id,
        name: f.name,
        mimeType: f.mimeType,
        etag: f.etag,
        size: buffer.length,
        content
      };
      await cacheSet(cacheKey, payload);
      return payload;
    }))
  );

  const ok = settled.filter(s => s.status === "fulfilled").map(s => s.value);
  const filesMeta = ok.map(({ fileId, name, mimeType, etag, size }) => ({ fileId, name, mimeType, etag, size }));

  // 3) Unir + recortar para no exceder contexto
  let merged = ok
    .map(x => `# ${x.name}\n\n${(x.content || "").trim()}\n`)
    .join("\n\n");

  if (merged.length > maxChars) merged = merged.slice(0, maxChars);

  // Seguridad de tamaño total
  const bodyProbe = { folderId, files: filesMeta, merged };
  if (approxBytes(bodyProbe) > MAX_RESPONSE_BYTES) {
    // Si aún es muy grande, recortamos más agresivo
    merged = merged.slice(0, Math.floor(MAX_RESPONSE_BYTES * 0.7));
  }

  res.setHeader("ETag", etag);
  res.setHeader("Cache-Control", "public, max-age=60");
  return res.status(200).json({ folderId, files: filesMeta, merged });
})));

// Lectura múltiple con modos y límites de tamaño
// POST /drive/bulkRead  body: { fileIds: string[], concurrency?: number, mode?: "meta"|"snippet"|"full", limitChars?: number }
app.post("/drive/bulkRead", withTimer("bulkRead", asyncHandler(async (req, res) => {
  const fileIds = req.body?.fileIds;
  if (!Array.isArray(fileIds) || !fileIds.length) {
    return res.status(400).json({ error: "Se requiere body { fileIds: string[] }" });
  }

  const concurrency = Math.max(1, Math.min(parseInt(req.body?.concurrency ?? "4", 10), 8));
  const mode = (req.body?.mode || DEFAULT_MODE).toLowerCase(); // meta | snippet | full
  const limitChars = Math.max(500, Math.min(parseInt(req.body?.limitChars ?? `${PER_FILE_LIMIT}`, 10), 20000));

  if (fileIds.length > MAX_FILES_BULK && mode !== "meta") {
    return res.status(400).json({
      error: `Demasiados archivos para una sola llamada (${fileIds.length}). Máximo ${MAX_FILES_BULK}.`,
      hint: "Usá varias llamadas o el modo 'meta' para decidir qué leer."
    });
  }

  const limit = pLimit(concurrency);
  const started = Date.now();

  const results = [];
  for (const id of fileIds) {
    const r = await limit(async () => {
      try {
        const meta = await getFileMeta(id);
        if (mode === "meta") {
          return {
            fileId: id,
            ok: true,
            name: meta.name,
            mimeType: meta.mimeType,
            size: meta.size,
            etag: meta.etag
          };
        }

        const cacheKey = `${id}:${meta.etag}`;
        const hit = await cacheGet(cacheKey);
        let contentRaw, size;
        if (hit) {
          contentRaw = hit.content;
          size = hit.size;
        } else {
          const buffer = await getFileBinary(id, meta.mimeType);
          size = buffer.length;
          contentRaw = await extractTextFromBuffer(buffer, meta.mimeType);
          const payload = {
            fileId: meta.id, name: meta.name, mimeType: meta.mimeType,
            etag: meta.etag, size, content: contentRaw
          };
          await cacheSet(cacheKey, payload);
        }

        const content = mode === "full" ? contentRaw : truncate(contentRaw, limitChars);
        return {
          fileId: meta.id,
          ok: true,
          name: meta.name,
          mimeType: meta.mimeType,
          etag: meta.etag,
          size,
          mode,
          limitChars,
          content
        };
      } catch (e) {
        return { fileId: id, ok: false, error: e.message || "failed" };
      }
    });

    results.push(r);

    // Control de tamaño acumulado
    const probe = { mode, results };
    if (approxBytes(probe) > MAX_RESPONSE_BYTES) {
      return res.status(413).json({
        error: "Respuesta demasiado grande. Se detuvo la lectura para evitar fallos.",
        served: results.length,
        limitBytes: MAX_RESPONSE_BYTES,
        hint: "Pedí menos archivos, usá mode=meta, o disminuí limitChars."
      });
    }
  }

  const totalMs = Date.now() - started;
  return res.status(200).json({ totalMs, mode, results });
})));

// Health & Stats
app.get("/health", withTimer("health", asyncHandler(async (req, res) => {
  try {
    let driveOk = true, cacheOk = true;
    const folderId = process.env.ALLOWED_FOLDER_IDS?.split(",")[0];
    if (folderId) { await getManifest(folderId); }
    if (redis) { await redis.ping(); }
    return res.status(200).json({ ok: true, driveOk, cacheOk });
  } catch (e) {
    return res.status(503).json({ ok: false, error: e.message });
  }
})));
app.get("/stats", (req, res) => res.status(200).json(metricsSnapshot()));

/* ============ Error handler global (captura async) ============ */
app.use((err, req, res, _next) => {
  const status = err.status || 500;
  console.error("Unhandled error:", err.stack || err);
  res.status(status).json({ error: err.message || "Internal Server Error" });
});

/* ============ Export para Vercel + listen local ============ */
if (!process.env.VERCEL) {
  app.listen(port, () => {
    console.log(`Servidor local: http://localhost:${port}`);
    if (!process.env.REDIS_URL) console.log("ℹ️ Cache en memoria (define REDIS_URL para Redis).");
  });
}
export default app;
