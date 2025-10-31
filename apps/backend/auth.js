// auth.js — Utilidad de autenticación y fábrica de clientes Google Drive
// Usos:
// 1) CLI para obtener REFRESH_TOKEN: `node auth.js`
// 2) Como módulo en index.js: import { getOAuthClient, getDrive } from './auth.js'

import readline from "readline";
import { google } from "googleapis";
import dotenv from "dotenv";

dotenv.config();

// ====== Config y helpers ======
export const SCOPES = [
  "https://www.googleapis.com/auth/drive.readonly",          // lectura de contenido
  "https://www.googleapis.com/auth/drive.metadata.readonly", // metadatos (modifiedTime, md5Checksum, etc.)
];

function requireEnv(name) {
  const v = process.env[name];
  if (!v) {
    throw new Error(`Falta variable de entorno: ${name}`);
  }
  return v;
}

// ====== Fábricas reutilizables ======
export function getOAuthClient() {
  const clientId = requireEnv("GOOGLE_CLIENT_ID");
  const clientSecret = requireEnv("GOOGLE_CLIENT_SECRET");
  const redirectUri = requireEnv("REDIRECT_URI");

  const oAuth2Client = new google.auth.OAuth2(clientId, clientSecret, redirectUri);

  // Si hay REFRESH_TOKEN configurado, dejalo listo para usar
  if (process.env.REFRESH_TOKEN) {
    oAuth2Client.setCredentials({ refresh_token: process.env.REFRESH_TOKEN });
  }
  return oAuth2Client;
}

export function getDrive() {
  const auth = getOAuthClient();
  return google.drive({ version: "v3", auth });
}

// ====== Modo CLI: obtener REFRESH_TOKEN ======
async function runCliFlow() {
  const auth = getOAuthClient();

  const authUrl = auth.generateAuthUrl({
    access_type: "offline",
    scope: SCOPES,
    prompt: "consent",
  });

  console.log("\n🔗 Abrí este enlace en el navegador y autoriza el acceso (solo lectura):\n");
  console.log(authUrl);

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  rl.question("\n📥 Pegá el código que te dio Google acá: ", async (code) => {
    rl.close();
    try {
      const { tokens } = await auth.getToken(code);
      // Mostramos el refresh token para que lo copies a Vercel (.env)
      console.log("\n✅ REFRESH TOKEN (copialo en Vercel → Environment Variables como REFRESH_TOKEN):\n");
      console.log(tokens.refresh_token || "(no recibido; revisá que el consentimiento haya sido explícito)");
      if (tokens.scope) console.log("\n🔍 Alcances otorgados:", tokens.scope);
    } catch (error) {
      console.error("\n❌ Error al obtener token:", error?.response?.data || error.message || error);
    }
  });
}

// Ejecutar CLI si se corre directamente este archivo
if (import.meta.url === `file://${process.argv[1]}`) {
  runCliFlow().catch((e) => {
    console.error("❌ Error en el flujo de autenticación:", e?.message || e);
    process.exit(1);
  });
}


