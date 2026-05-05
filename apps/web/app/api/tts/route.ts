// apps/web/app/api/tts/route.ts
import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export async function POST(req: NextRequest) {
  try {
    const { text } = await req.json();

    if (!text || typeof text !== "string") {
      return NextResponse.json({ error: "Falta el texto" }, { status: 400 });
    }

    const mp3 = await openai.audio.speech.create({
      model: "tts-1",
      voice: "onyx",       // más grave y masculina
      input: text.slice(0, 500),
      speed: 1.0,
      response_format: "mp3",
    });

    const buffer = Buffer.from(await mp3.arrayBuffer());

    return new NextResponse(buffer, {
      status: 200,
      headers: {
        "Content-Type": "audio/mpeg",
        "Content-Length": buffer.length.toString(),
        "Cache-Control": "no-store",
      },
    });
  } catch (e: any) {
    console.error("[TTS] Error:", e);
    return NextResponse.json({ error: e?.message ?? "Error generando audio" }, { status: 500 });
  }
}