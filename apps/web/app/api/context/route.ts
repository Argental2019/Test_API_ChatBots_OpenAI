import { NextRequest } from "next/server";

export const runtime = "edge";

const BACKEND_URL = process.env.BACKEND_URL!; // ej: https://test-api-chat-bots-open-ai.vercel.app

export async function POST(req: NextRequest) {
  try {
    const { driveFolders } = await req.json();
    if (!Array.isArray(driveFolders) || driveFolders.length === 0) {
      return new Response(JSON.stringify({ error: "driveFolders requerido" }), { status: 400 });
    }
    const sid = `session-${Date.now()}`;
    const allTexts: string[] = [];

    for (const folderId of driveFolders) {
      const r = await fetch(`${BACKEND_URL}/smartRead`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Session-Id": sid },
        body: JSON.stringify({ folderId, knownFiles: [], nocache: false })
      });
      if (!r.ok) throw new Error(await r.text());
      const data = await r.json();
      const texts: string[] = (data.snapshot || [])
        .map((f: any) => f?.content)
        .filter(Boolean);
      allTexts.push(...texts);
    }

    const fullContext = allTexts.join("\n\n---\n\n").slice(0, 100000);
    return new Response(JSON.stringify({ context: fullContext }), { status: 200 });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e?.message || "context error" }), { status: 500 });
  }
}
