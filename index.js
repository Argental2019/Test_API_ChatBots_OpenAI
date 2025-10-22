// index.js — Vercel-ready (Express export, lazy init, async safety)

import express from "express";
import dotenv from "dotenv";
import crypto from "crypto";
import pLimit from "p-limit";
import Redis from "ioredis";
import { google } from "googleapis";

// ⤵️ tu extractor (asegúrate que exista en el repo TEST)
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

/* ============ Cache (Redis opcional) ============ */
const mem = new Map();
let redis = null;
if (process.env.REDIS_URL) {
  redis = new Redis(process.env.REDIS_URL, { lazyConnect: true, maxRetriesPerRequest: 2 });
  redis.on("error", (e) => console.error("Redis error:", e.message));
}
const cacheGet = async (k) => (redis ? (await redis.get(k)) && JSON.parse(await redis.get(k)) : mem.get(k) || null);
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
  // REFRESH_TOKEN es opcional para endpoints que no llaman Drive; para los que sí, lo validamos allí.
  if (process.env.REFRESH_TOKEN) {
    oAuth2.setCredentials({ refresh_token: process.env.REFRESH_TOKEN });
  }
  return oAuth2;
}

function getDrive() {
  // Para llamadas reales a Drive, el refresh es requerido
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
  res.setHeader("ETag", makeEtag(JSON.stringify(manifest)));
  return res.status(200).json(manifest);
})));

// Leer archivo con caché
app.get("/drive/read", withTimer("read", asyncHandler(async (req, res) => {
  const fileId = req.query.fileId;
  if (!fileId) return res.status(400).json({ error: "Falta fileId" });

  const meta = await getFileMeta(fileId);
  const cacheKey = `${fileId}:${meta.etag}`;
  const hit = await cacheGet(cacheKey);
  if (hit) return res.status(200).json(hit);

  const buffer = await getFileBinary(fileId, meta.mimeType);
  const content = await extractTextFromBuffer(buffer, meta.mimeType);

  const payload = {
    fileId: meta.id,
    name: meta.name,
    mimeType: meta.mimeType,
    etag: meta.etag,
    size: buffer.length,
    content
  };
  await cacheSet(cacheKey, payload);
  return res.status(200).json(payload);
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

// Lectura múltiple
app.post("/drive/bulkRead", withTimer("bulkRead", asyncHandler(async (req, res) => {
  const fileIds = req.body?.fileIds;
  if (!Array.isArray(fileIds) || !fileIds.length) {
    return res.status(400).json({ error: "Se requiere body { fileIds: string[] }" });
  }

  const limit = pLimit(Number(process.env.MAX_CONCURRENCY || 4));
  const results = await Promise.allSettled(
    fileIds.map(id => limit(async () => {
      const meta = await getFileMeta(id);
      const cacheKey = `${id}:${meta.etag}`;
      const hit = await cacheGet(cacheKey);
      if (hit) return { fileId: id, ...hit };

      const buffer = await getFileBinary(id, meta.mimeType);
      const content = await extractTextFromBuffer(buffer, meta.mimeType);

      const payload = {
        fileId: meta.id,
        name: meta.name,
        mimeType: meta.mimeType,
        etag: meta.etag,
        size: buffer.length,
        content
      };
      await cacheSet(cacheKey, payload);
      return { fileId: id, ...payload };
    }))
  );

  const body = results.map((r, i) => r.status === "fulfilled"
    ? r.value
    : { fileId: fileIds[i], error: r.reason?.message || "failed" });

  return res.status(200).json(body);
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
