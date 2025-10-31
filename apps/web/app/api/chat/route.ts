import { NextRequest } from "next/server";

export const runtime = "edge";

export async function POST(req: NextRequest) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return new Response("Missing OPENAI_API_KEY", { status: 500 });

  const { messages, systemPrompt, context } = await req.json();

  const sys = {
    role: "system",
    content: `${systemPrompt}\n\nContexto documental:\n${context || ""}`
  };

  const payload = {
    model: "gpt-4o-mini",
    temperature: 0.1,
    stream: true,
    messages: [sys, ...(messages || [])]
  };

  const r = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`
    },
    body: JSON.stringify(payload)
  });

  if (!r.ok || !r.body) {
    const txt = await r.text();
    return new Response(txt || "OpenAI error", { status: 500 });
  }

  return new Response(r.body, {
    status: 200,
    headers: { "Content-Type": "text/event-stream" }
  });
}
