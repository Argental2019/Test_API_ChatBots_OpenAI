// web/app/api/voice-chat/route.ts
import { NextRequest, NextResponse } from "next/server";

const BACKEND_URL =
  process.env.NEXT_PUBLIC_BACKEND_URL || process.env.BACKEND_URL;

export async function POST(req: NextRequest) {
  try {
    if (!BACKEND_URL) {
      console.error("[proxy /api/voice-chat] BACKEND_URL no configurado");
      return NextResponse.json(
        { ok: false, error: "BACKEND_URL no configurado" },
        { status: 500 }
      );
    }

    const formData = await req.formData();

    const targetUrl = `${BACKEND_URL.replace(/\/$/, "")}/api/voice-chat`;
    console.log("[proxy /api/voice-chat] ->", targetUrl);

    const backendRes = await fetch(targetUrl, {
      method: "POST",
      body: formData,
    });

    const text = await backendRes.text();

    let data: any;
    try {
      data = JSON.parse(text);
    } catch (e) {
      console.error(
        "[proxy /api/voice-chat] Respuesta no JSON del backend, cuerpo crudo:",
        text
      );
      data = { ok: false, error: "Respuesta no JSON del backend", raw: text };
    }

    return NextResponse.json(data, { status: backendRes.status });
  } catch (err: any) {
    console.error("[proxy /api/voice-chat] Error:", err);
    return NextResponse.json(
      { ok: false, error: "Error en proxy de voice-chat" },
      { status: 500 }
    );
  }
}
