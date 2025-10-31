// utils/drive.js
import { google } from "googleapis";

export function getDriveClient() {
  const oAuth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.REDIRECT_URI,
  );
  oAuth2Client.setCredentials({ refresh_token: process.env.REFRESH_TOKEN });
  return google.drive({ version: "v3", auth: oAuth2Client });
}

// Lista archivos con metadata suficiente para detectar cambios
export async function listFolderWithManifest(drive, folderId) {
  const files = [];
  let pageToken = undefined;

  do {
    const { data } = await drive.files.list({
      q: `'${folderId}' in parents and trashed = false`,
      fields:
        "nextPageToken, files(id, name, mimeType, md5Checksum, modifiedTime, size)",
      pageToken,
      pageSize: 1000,
      supportsAllDrives: true,
      includeItemsFromAllDrives: true,
    });
    pageToken = data.nextPageToken;
    for (const f of data.files ?? []) {
      files.push({
        id: f.id,
        name: f.name,
        mimeType: f.mimeType,
        md5Checksum: f.md5Checksum ?? null,
        modifiedTime: f.modifiedTime ?? null,
        size: f.size ? Number(f.size) : null,
      });
    }
  } while (pageToken);

  return files;
}

// Obtiene metadata mínima para construir una cacheKey estable
export async function getFileMeta(drive, fileId) {
  const { data } = await drive.files.get({
    fileId,
    fields: "id, name, mimeType, md5Checksum, modifiedTime",
    supportsAllDrives: true,
  });
  return {
    id: data.id,
    name: data.name,
    mimeType: data.mimeType,
    md5Checksum: data.md5Checksum ?? null,
    modifiedTime: data.modifiedTime ?? null,
  };
}

export function buildCacheKey(meta) {
  // Orden de preferencia: md5Checksum > modifiedTime > id-only
  const tag =
    meta.md5Checksum ??
    (meta.modifiedTime ? new Date(meta.modifiedTime).getTime() : "noetag");
  return `${meta.id}:${tag}`;
}
