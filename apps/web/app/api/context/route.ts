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

export async function POST(req: NextRequest) {
  try {
    const BACKEND_URL = process.env.BACKEND_URL;
    if (!BACKEND_URL) return new Response("Missing BACKEND_URL", { status: 500 });

    const { driveFolders } = await req.json();
    if (!Array.isArray(driveFolders) || driveFolders.length === 0) {
      return new Response(JSON.stringify({ error: "driveFolders requerido" }), { status: 400 });
    }

    // Hacemos las llamadas en paralelo pero con timeout por carpeta
    const sid = `session-${Date.now()}`;
    const perFolderTimeoutMs = 25000; // 25s por carpeta (para no exceder maxDuration total)

    const calls = driveFolders.map(async (folderId: string) => {
      const ac = abortSignal(perFolderTimeoutMs);
      try {
        const r = await fetch(`${BACKEND_URL}/smartRead`, {
          method: "POST",
          headers: { "Content-Type": "application/json", "X-Session-Id": sid },
          body: JSON.stringify({ folderId, knownFiles: [], nocache: false }),
          signal: ac.signal
        });
        clearTimeout((ac as any).timeoutId);
        if (!r.ok) {
          const txt = await r.text().catch(() => "");
          throw new Error(`smartRead ${r.status}: ${txt || "error"}`);
        }
        const data = await r.json();
        const texts: string[] = (data.snapshot || []).map((f: any) => f?.content).filter(Boolean);
        return texts.join("\n\n---\n\n");
      } catch (e) {
        // devolvemos string vacío para permitir respuesta parcial
        console.error("smartRead error", folderId, (e as any)?.message || e);
        return "";
      }
    });

    const results = await Promise.allSettled(calls);
    const allTexts = results
      .map(r => (r.status === "fulfilled" ? r.value : ""))
      .filter(Boolean)
      .join("\n\n---\n\n");

    const fullContext = allTexts.slice(0, 100000); // tope
    if (!fullContext) {
      return new Response("No se pudo cargar contexto (timeout o error en backend).", { status: 504 });
    }
    return new Response(JSON.stringify({ context: fullContext }), { status: 200 });
  } catch (e: any) {
    console.error("context route error:", e);
    return new Response(e?.message || "context error", { status: 500 });
  }
}
