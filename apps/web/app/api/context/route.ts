import { NextRequest } from "next/server";

// Fuerza Node runtime (más compatible) y aumenta el máximo de duración a 60s (límite Vercel Pro)
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

// util: abort controller con timeout
function abortSignal(ms: number) {
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(new Error(`timeout after ${ms}ms`)), ms);
  // @ts-ignore
  ac.timeoutId = t;
  return ac;
}

// apps/web/api/context/route.ts
export async function POST(req: NextRequest) {
  try {
    const BACKEND_URL = process.env.BACKEND_URL;
    if (!BACKEND_URL) return new Response("Missing BACKEND_URL", { status: 500 });

    const { driveFolders, admin } = await req.json();
    if (!Array.isArray(driveFolders) || driveFolders.length === 0) {
      return new Response(JSON.stringify({ error: "driveFolders requerido" }), { status: 400 });
    }

    const sid = `session-${Date.now()}`;
    const perFolderTimeoutMs = 25000;

    const filesMetaAll: any[] = [];

    const calls = driveFolders.map(async (folderId: string) => {
      const ac = abortSignal(perFolderTimeoutMs);
      try {
        const r = await fetch(`${BACKEND_URL}/smartRead`, {
          method: "POST",
          headers: { "Content-Type": "application/json", "X-Session-Id": sid },
          body: JSON.stringify({
            folderId,
            knownFiles: [],
            nocache: false,
            includeMeta: !!admin,   
          }),
          signal: ac.signal
        });
        clearTimeout((ac as any).timeoutId);
        if (!r.ok) throw new Error(`smartRead ${r.status}: ${await r.text().catch(()=>"")}`);

        const data = await r.json();

        // Texto
        const texts: string[] = (data.snapshot || [])
          .map((f: any) => f?.content)
          .filter(Boolean);
        const joined = texts.join("\n\n---\n\n");

        // Metadatos (solo si admin y backend los envió)
        if (admin && Array.isArray(data.files)) {
          filesMetaAll.push(...data.files);
        } else if (admin && Array.isArray(data.snapshot)) {
          // fallback: sacarlos del snapshot
          filesMetaAll.push(...data.snapshot.map((f:any)=>({
            id: f.id, name: f.name, mimeType: f.mimeType,
            modifiedTime: f.modifiedTime, size: f.size, folderId
          })));
        }

        return joined;
      } catch (e) {
        console.error("smartRead error", folderId, (e as any)?.message || e);
        return "";
      }
    });

    const results = await Promise.allSettled(calls);
    const allTexts = results.map(r => (r.status === "fulfilled" ? r.value : "")).filter(Boolean).join("\n\n---\n\n");

    const fullContext = allTexts.slice(0, 100000);
    if (!fullContext) {
      return new Response("No se pudo cargar contexto (timeout o error en backend).", { status: 504 });
    }

    // 👇 ahora devolvés también files si admin
    return new Response(JSON.stringify({
      context: fullContext,
      files: filesMetaAll
    }), { status: 200 });

  } catch (e: any) {
    console.error("context route error:", e);
    return new Response(e?.message || "context error", { status: 500 });
  }
}
