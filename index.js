// index.js
import express from "express";
import dotenv from "dotenv";
import { extractTextFromBuffer } from "./utils/extractText.js";
import { getDriveClient, listFolderWithManifest, getFileMeta, buildCacheKey } from "./utils/drive.js";
import { cacheGet, cacheSet, cacheInfo } from "./utils/cache.js";
import pLimit from "p-limit";

dotenv.config();
const app = express();
const port = process.env.PORT || 3000;

app.use(express.json({ limit: "5mb" })); // <- necesario para /bulkRead

// Drive client
const drive = getDriveClient();

// ========= Endpoints =========

// A) Listar archivos simple (tu endpoint original)
app.get("/drive/list", async (req, res) => {
  const folderId = req.query.folderId;
  if (!folderId) return res.status(400).send("Falta folderId");

  try {
    const result = await drive.files.list({
      q: `'${folderId}' in parents and trashed = false`,
      fields: "files(id, name, mimeType)",
      supportsAllDrives: true,
      includeItemsFromAllDrives: true,
    });
    res.json({ files: result.data.files });
  } catch (err) {
    console.error("Error listando archivos:", err);
    res.status(500).send("Error listando archivos");
  }
});

// B) Manifest con checksums para evitar lecturas innecesarias
// GET /drive/manifest?folderId=...
// Opcional: enviar en body (POST) un manifest previo { files: [{id, tag}] } para que devolvamos {changed, unchanged}
app.get("/drive/manifest", async (req, res) => {
  const folderId = req.query.folderId;
  if (!folderId) return res.status(400).send("Falta folderId");
  try {
    const files = await listFolderWithManifest(drive, folderId);
    // tag = md5Checksum || modifiedTime
    const manifest = files.map(f => ({
      id: f.id,
      name: f.name,
      mimeType: f.mimeType,
      modifiedTime: f.modifiedTime,
      checksum: f.md5Checksum ?? null,
      size: f.size,
      tag: f.md5Checksum ?? (f.modifiedTime ? new Date(f.modifiedTime).getTime().toString() : null)
    }));
    res.json({
      folderId,
      count: manifest.length,
      cache: cacheInfo(),
      files: manifest
    });
  } catch (err) {
    console.error("Error generando manifest:", err);
    res.status(500).json({ error: "Error generando manifest", details: err.message });
  }
});

// C) Leer 1 archivo (con caché por fileId:etag)
app.get("/drive/read", async (req, res) => {
  const fileId = req.query.fileId;
  if (!fileId) return res.status(400).send("Falta fileId");

  try {
    // 1) Metadata para crear cacheKey
    const meta = await getFileMeta(drive, fileId);
    const cacheKey = buildCacheKey(meta);

    // 2) Intentar caché
    const cached = await cacheGet(cacheKey);
    if (cached) {
      return res.json({ ...cached, cached: true });
    }

    // 3) Descargar binario
    const fileData = await drive.files.get(
      { fileId, alt: "media" },
      { responseType: "arraybuffer" },
    );
    const buffer = Buffer.from(fileData.data);

    // 4) Extraer texto
    const content = await extractTextFromBuffer(buffer, meta.mimeType);

    // 5) Guardar en caché
    const payload = {
      id: meta.id,
      name: meta.name,
      mimeType: meta.mimeType,
      etag: cacheKey.split(":")[1],
      size: buffer.length,
      content,
    };
    const ttl = Number(process.env.CACHE_TTL_MS || 1000 * 60 * 60 * 24); // 24h default
    await cacheSet(cacheKey, payload, ttl);

    res.json({ ...payload, cached: false });
  } catch (err) {
    console.error("Error leyendo archivo:", err);
    res.status(500).json({ error: "Error leyendo archivo", details: err.message });
  }
});

// D) Lecturas múltiples en paralelo con límite de concurrencia
// POST /drive/bulkRead  { "fileIds": ["id1","id2",...], "concurrency": 3 }
app.post("/drive/bulkRead", async (req, res) => {
  const { fileIds, concurrency = 3 } = req.body || {};
  if (!Array.isArray(fileIds) || fileIds.length === 0) {
    return res.status(400).json({ error: "Enviá 'fileIds' como array no vacío." });
  }

  const limit = pLimit(Math.max(1, Math.min(8, Number(concurrency)))); // cap en 8 por seguridad

  try {
    const tasks = fileIds.map(fileId => limit(async () => {
      try {
        // Toda la lógica se comparte con /drive/read:
        const meta = await getFileMeta(drive, fileId);
        const cacheKey = buildCacheKey(meta);

        const cached = await cacheGet(cacheKey);
        if (cached) return { ...cached, cached: true };

        const fileData = await drive.files.get(
          { fileId, alt: "media" },
          { responseType: "arraybuffer" },
        );
        const buffer = Buffer.from(fileData.data);
        const content = await extractTextFromBuffer(buffer, meta.mimeType);

        const payload = {
          id: meta.id,
          name: meta.name,
          mimeType: meta.mimeType,
          etag: cacheKey.split(":")[1],
          size: buffer.length,
          content,
        };
        const ttl = Number(process.env.CACHE_TTL_MS || 1000 * 60 * 60 * 24);
        await cacheSet(cacheKey, payload, ttl);
        return { ...payload, cached: false };
      } catch (e) {
        return { id: fileId, error: true, message: e.message };
      }
    }));

    const results = await Promise.all(tasks);
    res.json({
      ok: true,
      count: results.length,
      cache: cacheInfo(),
      results
    });
  } catch (err) {
    console.error("Error en bulkRead:", err);
    res.status(500).json({ error: "Error en bulkRead", details: err.message });
  }
});

app.get("/", (req, res) => {
  res.send("✅ Google Drive API backend funcionando.");
});

app.listen(port, () => {
  console.log(`Servidor corriendo en http://localhost:${port}`);
});
