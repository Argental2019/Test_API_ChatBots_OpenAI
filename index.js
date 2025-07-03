import express from "express";
import dotenv from "dotenv";
import { google } from "googleapis";
import { extractTextFromBuffer } from "./utils/extractText.js";

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

// Listar archivos
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

// Leer contenido del archivo
app.get("/drive/read", async (req, res) => {
  const fileId = req.query.fileId;
  if (!fileId) return res.status(400).send("Falta fileId");

  try {
    const { data: fileMeta } = await drive.files.get({
      fileId,
      fields: "name, mimeType",
    });

    const fileData = await drive.files.get(
      { fileId, alt: "media" },
      { responseType: "arraybuffer" },
    );

    const buffer = Buffer.from(fileData.data);
    const content = await extractTextFromBuffer(buffer, fileMeta.mimeType);
    res.json({
      name: fileMeta.name,
      content,
    });
  } catch (err) {
    console.error("Error leyendo archivo:", err);
    res.status(500).send("Error leyendo archivo");
  }
});

app.get("/", (req, res) => {
  res.send("✅ Google Drive API backend funcionando.");
});

app.listen(port, () => {
  console.log(`Servidor corriendo en http://localhost:${port}`);
});
