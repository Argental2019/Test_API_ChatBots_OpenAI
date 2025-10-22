// index.js — versión mejorada (Drive ↔ Chatbots)
// Endpoints: /drive/list, /drive/manifest, /drive/read, /drive/readRange, /drive/bulkRead, /health, /stats

import express from "express";
import dotenv from "dotenv";
import { google } from "googleapis";
import pLimit from "p-limit";
import crypto from "crypto";
import Redis from "ioredis";

// ⇒ extractor actualizado: ahora acepta opts { fromPage, toPage }
import { extractTextFromBuffer } from "./utils/extractText.js";

dotenv.config();
const app = express();
const port = process.env.PORT || 3000;
app.use(express.json({ limit: "10mb" }));

/* =========================
   Google OAuth & Drive SDK
   ========================= */
const oAuth2Client = new google.auth.OAuth2(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  process.env.REDIRECT_URI
);
oAuth2Client.setCredentials({ refresh_token: process.env.REFRESH_TOKEN });
const drive = google.drive({ version: "v3", auth: oAuth2Client });

/* =========================
   Cache (Redis o memoria)
   ========================= */
const mem = new Map();
let redis = null;
if (process.env.REDIS_URL) {
  redis = new Redis(process.env.REDIS_URL, {
    lazyConnect: true,
    maxRetriesPerRequest: 2,
  });
  redis.on("error", (e) => console.error("Redis error:", e.message));
}
async function cacheGet(key) {
  if (redis) {
    const v = await redis.get(key);
    return v ? JSON.parse(v) : null;
  }
  return mem.get(key) || null;
}
async function cacheSet(key, val, ttlSec = 86400) {
  if (redis) {
    await redis.set(key, JSON.stringify(val), "EX", ttlSec);
  } else {
    mem.set(key, val);
  }
}

/* =========================
   Métricas simples p50/p95/p99
   ========================= */
const METRICS = { counts: {}, durs: {} };
function pct(arr, p) {
  if (!arr.length) return 0;
  const s = [...arr].sort((a, b) => a - b);
  const i = Math.floor((p / 100) * (s.length - 1));
  return s[i];
}
function withTimer(name, handler) {
  return async (req, res) => {
    const t0 = Date.now();
    METRICS.counts[name] = (METRICS.counts[name] || 0) + 1;
    try {
      await handler(req, res);
    } finally {
      const dt = Date.now() - t0;
      const arr = (METRICS.durs[name] ||= []);
      arr.push(dt);
      if (arr.length > 500) arr.shift();
    }
  };
}
function metricsSnapshot() {
  const out = {};
  for (const k of Object.keys(METRICS.counts)) {
    const arr = METRICS.durs[k] || [];
    out[k] = { count: METRICS.counts[k], p50: pct(arr, 50), p95: pct(arr, 95), p99: pct(arr, 99) };
  }
  return out;
}

/* =========================
   Helpers HTTP y Drive
   ========================= */
function makeEtag(payload) {
  return crypto.createHash("md5").update(payload).digest("hex");
}
function sendJson(res, obj) {
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.end(JSON.stringify(obj));
}
async function getFileMeta(fileId) {
  const fields = "id,name,mimeType,modifiedTime,md5Checksum,size";
  const { data } = await drive.files.get({ fileId, fields });
  return {
    id: data.id,
    name: data.name,
    mimeType: data.mimeType,
    size: data.size,
    modifiedTime: data.modifiedTime,
    etag: data.md5Checksum || data.modifiedTime, // nuestro "etag"
  };
}
async function getManifest(folderId) {
  const q = `'${folderId}' in parents and trashed = false`;
  const fields = "files(id,name,mimeType,modifiedTime,md5Checksum,size)";
  const { data } = await drive.files.list({ q, pageSize: 1000, fields });
  return {
    folderId,
    generatedAt: new Date().toISOString(),
    files: (data.files || []).map((f) => ({
      id: f.id,
      name: f.name,
      mimeType: f.mimeType,
      size: f.size,
      modifiedTime: f.modifiedTime,
      md5Checksum: f.md5Checksum,
      etag: f.md5Checksum || f.modifiedTime,
    })),
  };
}
async function getFileBinary(fileId, mimeType) {
  const isGoogleDoc = (mimeType || "").startsWith("application/vnd.google-apps");
  if (isGoogleDoc) {
    const { data } = await drive.files.export(
      { fileId, mimeType: "text/plain" },
      { responseType: "arraybuffer" }
    );
    return Buffer.from(data);
  }
  const { data } = await drive.files.get({ fileId, alt: "media" }, { responseType: "arraybuffer" });
  return Buffer.from(data);
}

/* =========================
   ENDPOINTS
   ========================= */

// 0) Ping
app.get("/", (req, res) => {
  res.send("✅ Google Drive API backend funcionando (v2).");
});

// 1) Listado básico (tu endpoint original)
app.get(
  "/drive/list",
  withTimer("list", async (req, res) => {
    const folderId = req.query.folderId;
    if (!folderId) return res.status(400).send("Falta folderId");
    try {
      const result = await drive.files.list({
        q: `'${folderId}' in parents and trashed = false`,
        fields: "files(id, name, mimeType)",
      });
      res.json({ files: result.data.files });
    } catch (err) {
      console.error("Error listando archivos:", err);
      res.status(500).send("Error listando archivos");
    }
  })
);

// 2) Manifest (metadatos + etags) — para lectura selectiva
app.get(
  "/drive/manifest",
  withTimer("manifest", async (req, res) => {
    const folderId = req.query.folderId;
    if (!folderId) return res.status(400).json({ error: "Falta folderId" });
    try {
      // (Opcional) validar folderId contra ALLOWED_FOLDER_IDS
      const manifest = await getManifest(folderId);
      res.setHeader("ETag", makeEtag(JSON.stringify(manifest)));
      // vercel.json agrega Cache-Control: public, max-age=60 para este endpoint
      sendJson(res, manifest);
    } catch (err) {
      console.error("Error generando manifest:", err);
      res.status(500).json({ error: "Error generando manifest", details: err.message });
    }
  })
);

// 3) Leer archivo con caché fileId:etag (tu /drive/read mejorado)
app.get(
  "/drive/read",
  withTimer("read", async (req, res) => {
    const fileId = req.query.fileId;
    if (!fileId) return res.status(400).json({ error: "Falta fileId" });
    try {
      const meta = await getFileMeta(fileId);
      const cacheKey = `${fileId}:${meta.etag}`;
      const hit = await cacheGet(cacheKey);
      if (hit) return sendJson(res, hit);

      const buffer = await getFileBinary(fileId, meta.mimeType);
      const content = await extractTextFromBuffer(buffer, meta.mimeType);

      const payload = {
        fileId: meta.id,
        name: meta.name,
        mimeType: meta.mimeType,
        etag: meta.etag,
        size: buffer.length,
        content,
      };

      await cacheSet(cacheKey, payload);
      sendJson(res, payload);
    } catch (err) {
      console.error("Error leyendo archivo:", err);
      res.status(500).json({ error: "Error leyendo archivo", details: err.message });
    }
  })
);

// 4) Leer rango de páginas (PDF) — ahora pasa { fromPage, toPage } al extractor
app.get(
  "/drive/readRange",
  withTimer("readRange", async (req, res) => {
    const { fileId } = req.query;
    const fromPage = Number(req.query.fromPage ?? 1);
    const toPage = Number(req.query.toPage ?? fromPage);

    if (!fileId) return res.status(400).json({ error: "Falta fileId" });
    try {
      const meta = await getFileMeta(fileId);
      if (!/pdf/i.test(meta.mimeType || meta.name))
        return res.status(400).json({ error: "readRange solo soporta PDFs" });

      const buffer = await getFileBinary(fileId, meta.mimeType);

      // ⤵️ ahora el extractor recibe el rango solicitado
      const content = await extractTextFromBuffer(buffer, meta.mimeType, {
        fromPage,
        toPage,
      });

      const payload = {
        fileId: meta.id,
        name: meta.name,
        mimeType: meta.mimeType,
        etag: meta.etag,
        requestedRange: { fromPage, toPage },
        content,
      };
      sendJson(res, payload);
    } catch (err) {
      console.error("Error en readRange:", err);
      res.status(500).json({ error: "Error leyendo rango de PDF", details: err.message });
    }
  })
);

// 5) Lectura múltiple con concurrencia y caché
app.post(
  "/drive/bulkRead",
  withTimer("bulkRead", async (req, res) => {
    const fileIds = req.body?.fileIds;
    if (!Array.isArray(fileIds) || fileIds.length === 0)
      return res.status(400).json({ error: "Se requiere body { fileIds: string[] }" });

    const limit = pLimit(Number(process.env.MAX_CONCURRENCY || 4));
    try {
      const results = await Promise.allSettled(
        fileIds.map((id) =>
          limit(async () => {
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
              content,
            };

            await cacheSet(cacheKey, payload);
            return { fileId: id, ...payload };
          })
        )
      );

      const body = results.map((r, i) =>
        r.status === "fulfilled" ? r.value : { fileId: fileIds[i], error: r.reason?.message || "failed" }
      );
      sendJson(res, body);
    } catch (err) {
      console.error("Error en bulkRead:", err);
      res.status(500).json({ error: "Error en bulkRead", details: err.message });
    }
  })
);

// 6) Health & Stats
app.get(
  "/health",
  withTimer("health", async (req, res) => {
    try {
      const folderId = process.env.ALLOWED_FOLDER_IDS?.split(",")[0];
      if (folderId) await getManifest(folderId); // ping Drive
      if (redis) await redis.ping();             // ping cache si existe
      res.json({ ok: true, driveOk: true, cacheOk: true });
    } catch (e) {
      res.status(503).json({ ok: false, error: e.message });
    }
  })
);

app.get("/stats", (req, res) => sendJson(res, metricsSnapshot()));

/* =========================
   Arranque local y export para Vercel
   ========================= */
// En Vercel NO hacemos listen(); exportamos la app.
// En local sí levantamos el servidor (npm run dev / start).
if (!process.env.VERCEL) {
  app.listen(port, () => {
    console.log(`Servidor corriendo en http://localhost:${port}`);
    if (!process.env.REDIS_URL) {
      console.log("ℹ️ Cache en memoria (define REDIS_URL para cache persistente).");
    }
  });
}
export default app;

