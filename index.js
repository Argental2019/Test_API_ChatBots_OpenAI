import express from "express";
import dotenv from "dotenv";
import { google } from "googleapis";
import { extractTextFromBuffer } from "./utils/extractText.js";
import { getFromCache, saveToCache } from "./utils/cache.js";
import cors from "cors";

dotenv.config();
const app = express();
const port = process.env.PORT || 3000;

// OAuth2 Client setup
const oAuth2Client = new google.auth.OAuth2(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  process.env.REDIRECT_URI,
);

oAuth2Client.setCredentials({
  refresh_token: process.env.REFRESH_TOKEN,
});

const drive = google.drive({ version: "v3", auth: oAuth2Client });

app.use(cors({ origin: true })); 
app.get("/drive/manifest", async (req, res) => {
  const folderId = req.query.folderId;
  if (!folderId) return res.status(400).send("Falta folderId");

  try {
    const result = await drive.files.list({
      q: `'${folderId}' in parents and trashed = false`,
      fields: "files(id, name, mimeType, modifiedTime, md5Checksum)",
    });

    const manifest = result.data.files.map(file => ({
      id: file.id,
      name: file.name,
      mimeType: file.mimeType,
      modifiedTime: file.modifiedTime,
      checksum: file.md5Checksum || 'no-checksum'
    }));

    res.json({ 
      folder: folderId,
      fileCount: manifest.length,
      files: manifest 
    });
  } catch (err) {
    console.error("Error obteniendo manifest:", err);
    res.status(500).json({ 
      error: "Error obteniendo manifest",
      details: err.message 
    });
  }
});

// ============================================
// Listar archivos (endpoint original)
// ============================================
app.get("/drive/list", async (req, res) => {
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
});

// ============================================
// 🆕 MEJORADO: Endpoint /drive/read con caché
// ============================================
app.get("/drive/read", async (req, res) => {
  const fileId = req.query.fileId;
  if (!fileId) return res.status(400).send("Falta fileId");

  try {
    // Obtener metadata del archivo (incluyendo etag)
    const { data: fileMeta } = await drive.files.get({
      fileId,
      fields: "name, mimeType, modifiedTime, md5Checksum",
    });

    const etag = fileMeta.md5Checksum || fileMeta.modifiedTime;

    console.log(`📄 Procesando: ${fileMeta.name}`);

    // Intentar obtener del caché
    const cachedContent = await getFromCache(fileId, etag);
    
    if (cachedContent) {
      console.log(`✅ Contenido obtenido del caché`);
      return res.json({
        name: fileMeta.name,
        content: cachedContent,
        mimeType: fileMeta.mimeType,
        cached: true
      });
    }

    console.log(`🔄 Descargando archivo desde Drive...`);

    // Si no está en caché, descargar y procesar
    const fileData = await drive.files.get(
      { fileId, alt: "media" },
      { responseType: "arraybuffer" },
    );

    const buffer = Buffer.from(fileData.data);
    const content = await extractTextFromBuffer(buffer, fileMeta.mimeType);

    // Guardar en caché
    await saveToCache(fileId, etag, content);
    console.log(`💾 Contenido guardado en caché`);

    res.json({
      name: fileMeta.name,
      content,
      size: buffer.length,
      mimeType: fileMeta.mimeType,
      cached: false
    });
  } catch (err) {
    console.error("Error leyendo archivo:", err);
    res.status(500).json({
      error: "Error leyendo archivo",
      details: err.message,
    });
  }
});

// ============================================
// 🆕 NUEVO: Endpoint /drive/bulkRead
// ============================================
app.post("/drive/bulkRead", express.json(), async (req, res) => {
  const { fileIds, concurrency = 3 } = req.body;

  if (!fileIds || !Array.isArray(fileIds) || fileIds.length === 0) {
    return res.status(400).json({ 
      error: "Se requiere un array de fileIds" 
    });
  }

  console.log(`📦 Lectura masiva de ${fileIds.length} archivos con concurrencia ${concurrency}`);

  const results = [];
  const errors = [];

  // Función auxiliar para procesar un archivo
  async function processFile(fileId) {
    try {
      // Obtener metadata
      const { data: fileMeta } = await drive.files.get({
        fileId,
        fields: "name, mimeType, modifiedTime, md5Checksum",
      });

      const etag = fileMeta.md5Checksum || fileMeta.modifiedTime;

      // Intentar caché primero
      let content = await getFromCache(fileId, etag);
      let fromCache = true;

      if (!content) {
        // Descargar si no está en caché
        const fileData = await drive.files.get(
          { fileId, alt: "media" },
          { responseType: "arraybuffer" },
        );

        const buffer = Buffer.from(fileData.data);
        content = await extractTextFromBuffer(buffer, fileMeta.mimeType);

        // Guardar en caché
        await saveToCache(fileId, etag, content);
        fromCache = false;
      }

      return {
        fileId,
        name: fileMeta.name,
        content,
        mimeType: fileMeta.mimeType,
        cached: fromCache,
        success: true
      };
    } catch (error) {
      return {
        fileId,
        error: error.message,
        success: false
      };
    }
  }

  // Procesar archivos con concurrencia limitada
  for (let i = 0; i < fileIds.length; i += concurrency) {
    const batch = fileIds.slice(i, i + concurrency);
    const batchResults = await Promise.all(batch.map(processFile));
    
    batchResults.forEach(result => {
      if (result.success) {
        results.push(result);
      } else {
        errors.push(result);
      }
    });
  }

  console.log(`✅ Procesados: ${results.length}, ❌ Errores: ${errors.length}`);

  res.json({
    total: fileIds.length,
    successful: results.length,
    failed: errors.length,
    results,
    errors: errors.length > 0 ? errors : undefined
  });
});

// ============================================
// Home
// ============================================
app.get("/", (req, res) => {
  res.send("✅ Google Drive API backend funcionando con caché y lectura masiva.");
});

app.listen(port, () => {
  console.log(`🚀 Servidor corriendo en http://localhost:${port}`);
});

//PRUEBA VERCEL REDIS
app.get("/debug/env", (req, res) => {
  res.json({
    redis: !!process.env.REDIS_URL,
    url: process.env.REDIS_URL ? "✅ Detected" : "❌ Missing",
  });
});
