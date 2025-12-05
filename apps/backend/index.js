// @ts-nocheck
// index.js — Backend Drive con caché + lecturas masivas (compatible Vercel)
// + Telemetría: log de "preguntas no respondidas" vía Redis
// + smartRead: siempre verifica actualizaciones, usa cache si no cambió y refetch si cambió

// ===== Imports =====
import { fileURLToPath } from "url";
import path from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

console.log("🔥 Backend Express cargado desde:", __filename);

import express from "express";
import dotenv from "dotenv";
import fetch from "node-fetch";
import crypto from "crypto";
import pLimit from "p-limit";
import Redis from "ioredis";
import { google } from "googleapis";
import { extractTextFromBuffer } from "./utils/extractText.js";
import cors from "cors";
import multer from "multer";
import OpenAI from "openai";
// ...
dotenv.config();
const app = express();
const port = process.env.PORT || 3001;
app.use(express.json({ limit: "10mb" }));
app.use(
  cors({
    origin: process.env.CORS_ORIGIN?.split(",") ?? ["*"],
    methods: ["GET", "POST", "OPTIONS"],
    allowedHeaders: ["Content-Type", "X-Session-Id"],
  })
);

// ===== Upload de audio (multer) =====
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 5 * 1024 * 1024, // máx ~5MB (ajustable)
  },
});

// ===== Cliente OpenAI (para voz → texto y opcionalmente chat) =====
let openai = null;
if (!process.env.OPENAI_API_KEY) {
  console.warn("⚠️ Falta OPENAI_API_KEY: /voice-chat no funcionará hasta que la configures.");
} else {
  openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
  });
}

// Opcional: backend de agentes (si querés encadenar voz → agentes directamente)
// Ej: https://test-chatbots-back.vercel.app/chat
const AGENT_BACKEND_URL = process.env.AGENT_BACKEND_URL || null;
const FRONTEND_URL = process.env.FRONTEND_URL || null; // ej: https://tu-frontend.vercel.app

// ===== Métricas simples =====
// TTL configurable (opcional). También podés dejarlo sin expiración si preferís.
const CACHE_TTL_SECONDS = Number(process.env.CACHE_TTL_SECONDS || 0); // 0 = sin TTL

function fileCacheKey(fileId) {
  return `file:${fileId}`;
}

const METRICS = { counts: {}, durs: {} };
const pct = (arr, p) =>
  arr.length ? [...arr].sort((a, b) => a - b)[Math.floor((p / 100) * (arr.length - 1))] : 0;

const metricsSnapshot = () =>
  Object.fromEntries(
    Object.keys(METRICS.counts).map((k) => {
      const arr = METRICS.durs[k] || [];
      return [k, { count: METRICS.counts[k], p50: pct(arr, 50), p95: pct(arr, 95), p99: pct(arr, 99) }];
    })
  );

const withTimer =
  (name, fn) =>
  async (req, res, next) => {
    const t0 = Date.now();
    METRICS.counts[name] = (METRICS.counts[name] || 0) + 1;
    try {
      await fn(req, res, next);
    } finally {
      const dt = Date.now() - t0;
      let arr = METRICS.durs[name];
      if (!arr) {
        arr = [];
        METRICS.durs[name] = arr;
      }
      arr.push(dt);
      if (arr.length > 500) arr.shift();
    }
  };

const asyncHandler = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
const makeEtag = (payload) => crypto.createHash("md5").update(payload).digest("hex");

// ===== Helpers varios =====
const truncate = (str, n) => (!str ? "" : str.length <= n ? str : str.slice(0, n) + " …");

// ===== Caché (Redis opcional / memoria fallback) =====
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
  return mem.has(k) ? mem.get(k) : null;
};
const cacheSet = async (k, v, ttl = 86400) => {
  if (redis) return redis.set(k, JSON.stringify(v), "EX", ttl);
  mem.set(k, v);
  return true;
};
const cacheDel = async (k) => {
  if (redis) return redis.del(k);
  return mem.delete(k);
};
const cacheDelByPrefix = async (prefix) => {
  if (redis) {
    const keys = [];
    await new Promise((resolve, reject) => {
      const stream = redis.scanStream({ match: `${prefix}*`, count: 100 });
      stream.on("data", (ks) => ks.length && keys.push(...ks));
      stream.on("end", resolve);
      stream.on("error", reject);
    });
    if (keys.length) await redis.del(...keys);
    return keys.length;
  }
  let removed = 0;
  for (const k of Array.from(mem.keys())) {
    if (k.startsWith(prefix)) {
      mem.delete(k);
      removed++;
    }
  }
  return removed;
};

// ===== Google OAuth/Drive =====
function requireEnvs(keys) {
  const missing = keys.filter((k) => !process.env[k]);
  if (missing.length) {
    const err = new Error("Missing ENVs: " + missing.join(", "));
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

// ===== Helpers Drive (ETag robusto) =====
function isGoogleDoc(mime) {
  return (mime || "").startsWith("application/vnd.google-apps");
}

async function getStrongDocRevision(drive, fileId) {
  const { data } = await drive.revisions.list({
    fileId,
    fields: "revisions(id, modifiedTime)",
    pageSize: 200,
  });
  const revs = data.revisions || [];
  const rev = revs.length ? revs[revs.length - 1] : null;
  return rev ? { revId: rev.id, revTime: rev.modifiedTime } : { revId: null, revTime: null };
}

async function getFileMeta(fileId) {
  const drive = getDrive();
  const fields = "id,name,mimeType,modifiedTime,md5Checksum,size,version";
  const { data } = await drive.files.get({ fileId, fields });

  let etag = data.md5Checksum || data.modifiedTime;
  if (isGoogleDoc(data.mimeType)) {
    const { revId, revTime } = await getStrongDocRevision(drive, fileId);
    if (revId) etag = `${revTime || data.modifiedTime}:${revId}`;
  }

  return {
    id: data.id,
    name: data.name,
    mimeType: data.mimeType,
    size: data.size,
    modifiedTime: data.modifiedTime,
    etag,
  };
}

async function getManifest(folderId) {
  const drive = getDrive();
  const q = `'${folderId}' in parents and trashed = false`;
  const fields = "files(id,name,mimeType,modifiedTime,md5Checksum,size)";
  const { data } = await drive.files.list({ q, pageSize: 1000, fields });

  const limit = pLimit(Number(process.env.MAX_CONCURRENCY || 6));
  const files = await Promise.all(
    (data.files || []).map((f) =>
      limit(async () => {
        let etag = f.md5Checksum || (f.modifiedTime ? String(new Date(f.modifiedTime).getTime()) : null);
        if (isGoogleDoc(f.mimeType)) {
          const { revId, revTime } = await getStrongDocRevision(drive, f.id);
          if (revId) etag = `${revTime || f.modifiedTime}:${revId}`;
        }
        return {
          id: f.id,
          name: f.name,
          mimeType: f.mimeType,
          size: f.size,
          modifiedTime: f.modifiedTime,
          md5Checksum: f.md5Checksum || null,
          etag,
        };
      })
    )
  );

  return {
    folderId,
    generatedAt: new Date().toISOString(),
    files,
  };
}

async function getFileBinary(fileId, mimeType) {
  const drive = getDrive();
  if (isGoogleDoc(mimeType)) {
    const { data } = await drive.files.export(
      { fileId, mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" },
      { responseType: "arraybuffer" }
    );
    return Buffer.from(data);
  }
  const { data } = await drive.files.get({ fileId, alt: "media" }, { responseType: "arraybuffer" });
  return Buffer.from(data);
}

// ===== Smart cache helpers (manifest + per-file) =====
const MANIFEST_KEY = (folderId) => `manifest:${folderId}`;
const FILE_KEY = (fileId, etag) => `file:${fileId}:${etag}`;
const FILE_PREFIX = (fileId) => `file:${fileId}:`;

async function getCachedManifest(folderId) {
  return await cacheGet(MANIFEST_KEY(folderId));
}
async function setCachedManifest(folderId, manifest, ttlSec = 3600) {
  await cacheSet(MANIFEST_KEY(folderId), manifest, ttlSec);
}

// Lee 1 archivo respetando cache por etag; para robustez reobtiene meta fuerte
async function readFileSmart(file) {
  const strongMeta = await getFileMeta(file.id);
  const { id, name, mimeType, etag } = strongMeta;
  const k = FILE_KEY(id, etag);

  const hit = await cacheGet(k);
  if (hit) {
    console.log("[readFileSmart] HIT", { id, name, mimeType, etag });
    return { fromCache: true, ...hit };
  }

  console.log("[readFileSmart] MISS, leyendo de Drive", { id, name, mimeType, etag });

  const buffer = await getFileBinary(id, mimeType);
  const content = await extractTextFromBuffer(buffer, mimeType);

  console.log("[readFileSmart] EXTRACTION", {
    id,
    name,
    mimeType,
    size: buffer.length,
    contentLen: content?.length ?? 0,
    sample: (content || "").slice(0, 200),
  });

  const payload = { fileId: id, name, mimeType, etag, size: buffer.length, content };

  await cacheDelByPrefix(FILE_PREFIX(id));
  await cacheSet(k, payload, 60 * 60 * 24 * 7);
  return { fromCache: false, ...payload };
}

function diffManifests(prev, curr) {
  const prevMap = new Map((prev?.files || []).map((f) => [f.id, f.etag]));
  const changed = [];
  const unchanged = [];
  for (const f of curr.files || []) {
    const prevEtag = prevMap.get(f.id);
    if (!prevEtag || prevEtag !== f.etag) changed.push(f);
    else unchanged.push(f);
  }
  // added = ids que no estaban; removed = ids que estaban y ya no
  const currIds = new Set((curr.files || []).map((f) => f.id));
  const prevIds = new Set((prev?.files || []).map((f) => f.id));
  const added = [...currIds].filter((id) => !prevIds.has(id));
  const removed = [...prevIds].filter((id) => !currIds.has(id));
  return { changed, unchanged, added, removed };
}

const ensureSessionId = (req, res, next) => {
  const sid = req.header("X-Session-Id") || req.query.sessionId || req.body?.sessionId;
  if (!sid) return res.status(400).json({ error: "Missing X-Session-Id" });
  req.sessionId = sid;
  next();
};

// Convierte el stream SSE de /api/chat en texto plano
async function readSSEStreamToText(stream) {
  if (!stream) return "";

  const decoder = new TextDecoder();
  let full = "";

  for await (const chunk of stream) {
    const textChunk = decoder.decode(chunk, { stream: true });

    // /api/chat devuelve SSE tipo "data: {...}\n\n"
    const lines = textChunk.split("\n");
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed.startsWith("data:")) continue;

      const data = trimmed.slice(5).trim(); // después de "data:"
      if (!data || data === "[DONE]") continue;

      try {
        const json = JSON.parse(data);
        const delta = json.choices?.[0]?.delta?.content || "";
        if (delta) full += delta;
      } catch (err) {
        console.warn("[voice-chat] No se pudo parsear chunk SSE:", data);
      }
    }
  }

  return full;
}

// Limpia @@META y @@MISS de la respuesta del modelo
function cleanLLMResponse(text) {
  if (!text) return "";
  // Eliminar @@META {...}
  let cleaned = text.replace(/@@META\s*\{[\s\S]*?\}/g, "").trim();
  // Eliminar @@MISS {...} (solo la línea técnica)
  cleaned = cleaned.replace(/^@@MISS\s*\{[^\n]*\}\s*\n?/m, "").trim();
  return cleaned;
}

// ===== Endpoints Drive =====

// Ping raíz
app.get("/", (req, res) => res.status(200).send("✅ Google Drive API backend (Vercel-ready)"));

// Listado básico
app.get(
  "/drive/list",
  withTimer(
    "list",
    asyncHandler(async (req, res) => {
      const folderId = req.query.folderId;
      if (!folderId) return res.status(400).json({ error: "Falta folderId" });

      const drive = getDrive();
      const { data } = await drive.files.list({
        q: "'" + folderId + "' in parents and trashed = false",
        fields: "files(id,name,mimeType)",
      });
      return res.status(200).json({ files: data.files || [] });
    })
  )
);

// Manifest
app.get(
  "/drive/manifest",
  withTimer(
    "manifest",
    asyncHandler(async (req, res) => {
      const folderId = req.query.folderId;
      if (!folderId) return res.status(400).json({ error: "Falta folderId" });
      const manifest = await getManifest(folderId);
      res.setHeader("ETag", makeEtag(JSON.stringify(manifest)));
      return res.status(200).json(manifest);
    })
  )
);
app.get("/diag", (req, res) => {
  res.json({
    ok: true,
    env: {
      GOOGLE_CLIENT_ID: !!process.env.GOOGLE_CLIENT_ID,
      GOOGLE_CLIENT_SECRET: !!process.env.GOOGLE_CLIENT_SECRET,
      REDIRECT_URI: !!process.env.REDIRECT_URI,
      REFRESH_TOKEN: !!process.env.REFRESH_TOKEN,
      REDIS_URL: !!process.env.REDIS_URL,
      ALLOWED_FOLDER_IDS: !!process.env.ALLOWED_FOLDER_IDS,
    },
    cache: { provider: redis ? "redis" : "memory" },
  });
});

// Health light que NO toca Google Drive
app.get("/health-lite", (req, res) => {
  res.status(200).json({ ok: true, ts: new Date().toISOString() });
});

/**
 * 🎙 /voice-chat
 * - Espera multipart/form-data con:
 *   - campo "audio" (Blob/archivo WebM/OGG/M4A, etc.)
 *   - campo "agentId" (string)
 *   - opcional "systemPrompt" (string) → si querés mandarlo desde el front
 *   - opcional "context" (string) → snapshot de smartRead que ya usás en /api/chat
 */
app.post(
  "/api/voice-chat",
  upload.single("audio"),
  withTimer(
    "voiceChat",
    asyncHandler(async (req, res) => {
      try {
        if (!openai) {
          return res.status(500).json({
            ok: false,
            error: "OPENAI_API_KEY no está configurada en el backend.",
          });
        }

        if (!FRONTEND_URL) {
          return res.status(500).json({
            ok: false,
            error: "FRONTEND_URL no está configurada (URL del Next que expone /api/chat).",
          });
        }

        const file = req.file;
        const agentId = req.body.agentId;
        const sessionId =
          req.body.sessionId || req.headers["x-session-id"] || `voice-${Date.now()}`;

        // Estos dos los puede mandar el front junto con el audio
        const systemPromptFromBody = req.body.systemPrompt;
        const contextFromBody = req.body.context || "";

        console.log("[/voice-chat] Request recibido:", {
          hasFile: !!file,
          agentId,
          mimetype: file?.mimetype,
          size: file?.size,
          sessionId,
        });

        if (!file) {
          return res.status(400).json({
            ok: false,
            error: "No se recibió archivo de audio (campo 'audio').",
          });
        }

// 1️⃣ Transcribir audio con OpenAI Whisper
console.log("[/voice-chat] Transcribiendo audio...");

const transcription = await openai.audio.transcriptions.create({
  file: new File([file.buffer], file.originalname || "audio.webm", {
    type: file.mimetype || "audio/webm",
  }),
  model: "whisper-1",
  language: "es",
});

const rawText = (transcription.text || "").trim();
const lower = rawText.toLowerCase();

console.log("[/voice-chat] ✅ Transcripción:", {
  textPreview: rawText.substring(0, 120),
  length: rawText.length,
});

// 🚫 Frases típicas de ruido (YouTube, Amara, etc.)
const NOISE_PATTERNS = [
  "subtítulos realizados por la comunidad de amara.org",
  "subtitulos realizados por la comunidad de amara.org",
  "gracias por ver el video",
  "gracias por ver el vídeo",
  "no olvides suscribirte",
  "no olvides suscribirte al canal",
  "suscríbete al canal",
  "suscribete al canal",
  "activa la campanita",
  "dale like y comparte",
];

const looksLikeNoise = NOISE_PATTERNS.some((p) => lower.includes(p));

// Heurística extra: texto muy corto o solo una frase suelta sin pinta de consulta
const isVeryShort = rawText.length < 5;

// ⚠️ Si no hay texto, es muy corto o detectamos ruido conocido:
// devolvemos mensaje amable y NO llamamos a /api/chat
if (!rawText || isVeryShort || looksLikeNoise) {
  const friendlyMsg =
    "Lo siento, no pude escuchar ninguna pregunta clara en el audio. " +
    "Podés repetir la consulta o escribirla directamente en el chat.";

  console.warn(
    "[/voice-chat] Transcripción vacía / muy corta o ruido conocido, devolviendo mensaje amable."
  );

  return res.status(200).json({
    ok: true,
    question: "",
    answer: friendlyMsg,
  });
}

// Si llegamos acá, la transcripción se considera una pregunta válida
const question = rawText;
        // 2️⃣ Armar payload EXACTO que espera /api/chat
        // Si no te mandan systemPrompt desde el front, usamos uno genérico según agentId
        const fallbackPrompt =
          agentId === "panier-iii-45x70"
            ? "Sos un asistente experto en productos Argental, específicamente en el Panier III 45x70. Respondé de forma clara, breve y profesional."
            : "Sos un asistente de Argental. Respondé de forma clara y profesional usando únicamente la información del contexto documental proporcionado.";

        const systemPrompt = (systemPromptFromBody || fallbackPrompt).trim();
        console.log("[/voice-chat] SYSTEM PROMPT LEN:", systemPrompt.length);
        console.log("[/voice-chat] CONTEXT LEN:", (contextFromBody || "").length);
        const payload = {
          systemPrompt,
          context: contextFromBody, // snapshot que ya armás con smartRead en el front
          messages: [
            {
              role: "user",
              content: question,
            },
          ],
        };

        const chatUrl = `${FRONTEND_URL}/api/chat`;
        console.log("[/voice-chat] Llamando a", chatUrl);

        const r = await fetch(chatUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(payload),
        });

        if (!r.ok || !r.body) {
          const txt = await r.text().catch(() => "");
          console.error("[/voice-chat] Error en /api/chat:", r.status, txt);
          return res.status(500).json({
            ok: false,
            error: "Error al consultar /api/chat en el frontend.",
            details: txt,
          });
        }

        // 3️⃣ /api/chat devuelve un stream SSE → lo convertimos a texto final y lo limpiamos
        const rawAnswer = await readSSEStreamToText(r.body);
        const answer = cleanLLMResponse(rawAnswer);

        console.log("[/voice-chat] ✅ Respuesta final (limpia):", {
          preview: answer.substring(0, 120),
        });

        return res.status(200).json({
          ok: true,
          question,
          answer,
        });
      } catch (err) {
        console.error("[/voice-chat] ❌ Error:", err);
        return res.status(500).json({
          ok: false,
          error: "Error procesando audio en /voice-chat.",
          details: err.message,
        });
      }
    })
  )
);

// Leer archivo con caché (soporta ?force=true)
app.get(
  "/drive/read",
  withTimer(
    "read",
    asyncHandler(async (req, res) => {
      const fileId = req.query.fileId;
      const force = String(req.query.force || "false").toLowerCase() === "true";
      if (!fileId) return res.status(400).json({ error: "Falta fileId" });

      const meta = await getFileMeta(fileId);
      const cacheKey = FILE_KEY(fileId, meta.etag);

      if (!force) {
        const hit = await cacheGet(cacheKey);
        if (hit) return res.status(200).json(hit);
      }

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

      // PURGA versiones anteriores antes de escribir la nueva
      await cacheDelByPrefix(FILE_PREFIX(meta.id));

      // TTL configurable global si se definió, si no usa default de cacheSet
      if (CACHE_TTL_SECONDS > 0) {
        await cacheSet(cacheKey, payload, CACHE_TTL_SECONDS);
      } else {
        await cacheSet(cacheKey, payload);
      }

      return res.status(200).json(payload);
    })
  )
);

// Leer rango PDF
app.get(
  "/drive/readRange",
  withTimer(
    "readRange",
    asyncHandler(async (req, res) => {
      const fileId = req.query.fileId;
      const fromPage = Number(req.query.fromPage !== undefined ? req.query.fromPage : 1);
      const toPage = Number(req.query.toPage !== undefined ? req.query.toPage : fromPage);

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
        content,
      };
      return res.status(200).json(payload);
    })
  )
);

// Lectura múltiple (body: { fileIds: string[], force?: boolean })
app.post(
  "/drive/bulkRead",
  withTimer(
    "bulkRead",
    asyncHandler(async (req, res) => {
      const fileIds = req.body && req.body.fileIds;
      const force = !!(req.body && req.body.force);
      if (!Array.isArray(fileIds) || !fileIds.length) {
        return res.status(400).json({ error: "Se requiere body { fileIds: string[] }" });
      }

      const limit = pLimit(Number(process.env.MAX_CONCURRENCY || 4));
      const results = await Promise.allSettled(
        fileIds.map((id) =>
          limit(async () => {
            const meta = await getFileMeta(id);
            const cacheKey = FILE_KEY(id, meta.etag);
            const hit = !force ? await cacheGet(cacheKey) : null;
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
            console.log("ARCHIVO PROCESADO:", id, (content || "").length);

            // PURGA versiones anteriores antes de escribir la nueva
            await cacheDelByPrefix(FILE_PREFIX(meta.id));

            if (CACHE_TTL_SECONDS > 0) {
              await cacheSet(cacheKey, payload, CACHE_TTL_SECONDS);
            } else {
              await cacheSet(cacheKey, payload);
            }
            return { fileId: id, ...payload };
          })
        )
      );

      const body = results.map((r, i) =>
        r.status === "fulfilled"
          ? r.value
          : { fileId: fileIds[i], error: (r.reason && r.reason.message) || "failed" }
      );

      return res.status(200).json(body);
    })
  )
);

// ===== NUEVO: smartRead (POST) — ciclo completo en caliente =====
// Body: { folderId, knownFiles?: [{id, tag}], nocache?: boolean }
app.post(
  "/smartRead",
  ensureSessionId,
  withTimer(
    "smartRead",
    asyncHandler(async (req, res) => {
      const { folderId, knownFiles = [], nocache = false, includeMeta = false } = req.body || {};
      if (!folderId) return res.status(400).json({ error: "Falta folderId" });

      // 1) Manifest actual
      const currManifest = await getManifest(folderId);

      // 2) Manifest previo (si no mandan knownFiles, usamos el cache del servidor)
      const prevManifest =
        Array.isArray(knownFiles) && knownFiles.length
          ? { files: knownFiles.map((f) => ({ id: f.id, etag: f.tag })) }
          : await getCachedManifest(folderId);

      // 3) Diff
      const { changed, added, removed } = diffManifests(prevManifest || { files: [] }, currManifest);

      // 4) opcional: forzar relectura (debug)
      if (nocache) {
        for (const f of currManifest.files) {
          await cacheDelByPrefix(FILE_PREFIX(f.id));
        }
      }

      // 5) invalidar lo removido/cambiado
      const toInvalidate = [...removed, ...changed.map((f) => f.id)];
      for (const id of toInvalidate) {
        await cacheDelByPrefix(FILE_PREFIX(id));
      }

      // 6) relectura de added + changed
      const needLoad = [...added, ...changed.map((f) => f.id)];
      if (needLoad.length) {
        const limit = pLimit(Number(process.env.MAX_CONCURRENCY || 6));
        await Promise.all(
          needLoad.map((id) =>
            limit(async () => {
              const meta = currManifest.files.find((f) => f.id === id) || (await getFileMeta(id));
              await readFileSmart({
                id: meta.id,
                etag: meta.etag, // ojo: en manifest podría llamarse etag
                mimeType: meta.mimeType,
                name: meta.name,
              });
            })
          )
        );
      }

      // 7) snapshot para el agente (todo lo actual del folder)
      const snapshot = [];
      for (const f of currManifest.files) {
        const k = FILE_KEY(f.id, f.etag);
        let hit = await cacheGet(k);

        if (!hit) {
          // Fallback: si no está en cache, lo leo ahora mismo
          try {
            const loaded = await readFileSmart({
              id: f.id,
              etag: f.etag,
              mimeType: f.mimeType,
              name: f.name,
            });
            hit = loaded;
            console.log("[smartRead] cache miss → reload", {
              id: f.id,
              name: f.name,
              mimeType: f.mimeType,
              contentLen: loaded.content?.length ?? 0,
            });
          } catch (e) {
            console.error("[smartRead] error releyendo archivo en fallback", f.id, e);
          }
        }

        if (hit) {
          snapshot.push(hit);
        } else {
          console.warn("[smartRead] archivo sin contenido ni cache", {
            id: f.id,
            name: f.name,
            mimeType: f.mimeType,
          });
        }
      }

      // 8) persistir manifest nuevo
      await setCachedManifest(folderId, currManifest);

      // 9) armar respuesta base
      const response = {
        hasChanges: Boolean(added.length || changed.length || removed.length || nocache),
        added,
        changed: changed.map((f) => f.id),
        removed,
        manifestNew: {
          folderId,
          files: currManifest.files.map((f) => ({ id: f.id, tag: f.etag })),
        },
        snapshot, // [{ id,name,mimeType,etag,size,content }]
      };

      // 10) incluir metadatos si lo pidieron (sin content)
      if (includeMeta) {
        response.files = currManifest.files.map((f) => ({
          id: f.id,
          name: f.name,
          mimeType: f.mimeType,
          modifiedTime: f.modifiedTime,
          size: f.size,
          etag: f.etag,
          folderId,
        }));
      }
      console.log("[smartRead] OUT", {
        folderId,
        snapshotCount: snapshot.length,
        snapshotFiles: snapshot.map((f) => ({
          id: f.fileId || f.id,
          name: f.name,
          len: (f.content || "").length,
        })),
      });
      // 11) enviar
      res.status(200).json(response);
    })
  )
);

// ===== Verificar cambios desde un manifest/knownFiles previo =====
// POST /drive/checkChanges
// Body: { folderId: string, knownFiles: [{ id: string, tag: string }] }
app.post(
  "/drive/checkChanges",
  withTimer(
    "checkChanges",
    asyncHandler(async (req, res) => {
      const { folderId, knownFiles } = req.body || {};
      if (!folderId || !Array.isArray(knownFiles)) {
        return res.status(400).json({ error: "Enviá 'folderId' y 'knownFiles' como array" });
      }
      const manifest = await getManifest(folderId);
      const currentFiles = manifest.files;

      const knownMap = new Map(knownFiles.map((f) => [f.id, f.tag]));
      const currentMap = new Map(currentFiles.map((f) => [f.id, f.etag]));

      const changed = [];
      const unchanged = [];
      const deleted = [];
      const added = [];

      for (const [id, oldTag] of knownMap) {
        if (!currentMap.has(id)) deleted.push(id);
        else if (currentMap.get(id) !== oldTag) changed.push(id);
        else unchanged.push(id);
      }
      for (const [id] of currentMap) {
        if (!knownMap.has(id)) added.push(id);
      }

      const hasChanges = changed.length > 0 || deleted.length > 0 || added.length > 0;

      res.json({
        hasChanges,
        changed,
        added,
        deleted,
        unchanged,
        manifestNew: { folderId, files: currentFiles.map((f) => ({ id: f.id, tag: f.etag })) },
        summary: {
          total: currentFiles.length,
          changed: changed.length,
          added: added.length,
          deleted: deleted.length,
          unchanged: unchanged.length,
        },
      });
    })
  )
);

// ===== Invalidar caché de archivos específicos =====
// POST /cache/invalidate
// Body: { fileIds: ["id1","id2", ...] }
app.post(
  "/cache/invalidate",
  withTimer(
    "invalidate",
    asyncHandler(async (req, res) => {
      const { fileIds } = req.body || {};
      if (!Array.isArray(fileIds) || fileIds.length === 0) {
        return res.status(400).json({ error: "Enviá 'fileIds' como array no vacío" });
      }
      const details = [];
      for (const fileId of fileIds) {
        const removed = await cacheDelByPrefix(FILE_PREFIX(fileId));
        details.push({ id: fileId, removedKeys: removed });
      }
      res.json({ ok: true, invalidated: details.reduce((a, b) => a + b.removedKeys, 0), details });
    })
  )
);

// ===== Telemetría: "preguntas sin respuesta" (unanswered / misses) =====
const MISS_STREAM_KEY = process.env.MISS_STREAM_KEY || "agent:misses";
const MISS_MAXLEN = Number(process.env.MISS_MAXLEN || 10000);
const MISS_COUNTER_TTL_DAYS = Number(process.env.MISS_COUNTER_TTL_DAYS || 90);
const MISS_MEM = [];

const nowISO = () => new Date().toISOString();
const ymd = () => new Date().toISOString().slice(0, 10);

async function logMiss({ question, agentId, userId, folderId, conversationId, notes, context }) {
  const payload = {
    ts: nowISO(),
    ymd: ymd(),
    agentId: agentId || "",
    userId: userId || "",
    folderId: folderId || "",
    conversationId: conversationId || "",
    question: truncate(String(question || ""), 1000),
    notes: truncate(String(notes || ""), 500),
    context: truncate(String(context || ""), 2000),
    qhash: crypto.createHash("md5").update(String(question || "")).digest("hex"),
  };

  if (redis) {
    await redis.xadd(
      MISS_STREAM_KEY,
      "MAXLEN",
      "~",
      String(MISS_MAXLEN),
      "*",
      "ts",
      payload.ts,
      "ymd",
      payload.ymd,
      "agentId",
      payload.agentId,
      "userId",
      payload.userId,
      "folderId",
      payload.folderId,
      "conversationId",
      payload.conversationId,
      "question",
      payload.question,
      "qhash",
      payload.qhash,
      "notes",
      payload.notes,
      "context",
      payload.context
    );

    const dayKey = `agent:misses:count:${payload.ymd}`;
    await redis.incr(dayKey);
    if (MISS_COUNTER_TTL_DAYS > 0) {
      await redis.expire(dayKey, MISS_COUNTER_TTL_DAYS * 86400);
    }
    await redis.incr("agent:misses:count:total");
  } else {
    MISS_MEM.push(payload);
    if (MISS_MEM.length > MISS_MAXLEN) MISS_MEM.shift();
  }

  return payload;
}

// Endpoint para registrar un miss
app.post(
  "/agent/log-miss",
  withTimer(
    "logMiss",
    asyncHandler(async (req, res) => {
      const { question, agentId, userId, folderId, conversationId, notes, context } = req.body || {};
      if (!question) return res.status(400).json({ error: "Falta 'question' en el body." });

      const saved = await logMiss({ question, agentId, userId, folderId, conversationId, notes, context });
      return res.status(201).json({ ok: true, saved });
    })
  )
);

// Estadísticas simples: total y del día
app.get(
  "/agent/miss-stats",
  withTimer(
    "missStats",
    asyncHandler(async (_req, res) => {
      if (redis) {
        const [total, today] = await redis.mget(
          "agent:misses:count:total",
          `agent:misses:count:${ymd()}`
        );
        return res.status(200).json({
          ok: true,
          total: Number(total || 0),
          today: Number(today || 0),
          stream: MISS_STREAM_KEY,
          maxlen: MISS_MAXLEN,
        });
      }
      return res.status(200).json({
        ok: true,
        total: MISS_MEM.length,
        today: MISS_MEM.filter((r) => r.ymd === ymd()).length,
        stream: "(mem)",
        maxlen: MISS_MAXLEN,
      });
    })
  )
);

// ===== Health & Stats =====
app.get(
  "/health",
  withTimer(
    "health",
    asyncHandler(async (_req, res) => {
      try {
        const folderId =
          (process.env.ALLOWED_FOLDER_IDS && process.env.ALLOWED_FOLDER_IDS.split(",")[0]) || null;
        if (folderId) {
          await getManifest(folderId);
        }
        if (redis) {
          await redis.ping();
        }
        return res.status(200).json({ ok: true, driveOk: true, cacheOk: true });
      } catch (e) {
        return res.status(503).json({ ok: false, error: e.message });
      }
    })
  )
);

app.get("/stats", (req, res) => res.status(200).json(metricsSnapshot()));

// ===== Error handler global =====
app.use((err, req, res, _next) => {
  const status = err.status || 500;
  console.error("Unhandled error:", err.stack || err);
  res.status(status).json({ error: err.message || "Internal Server Error" });
});

// ===== Export para Vercel + listen local =====
if (!process.env.VERCEL) {
  app.listen(port, () => {
    console.log(`Servidor local: http://localhost:${port}`);
    if (!process.env.REDIS_URL) console.log("ℹ️ Cache en memoria (define REDIS_URL para Redis).");
  });
}

export default app;
