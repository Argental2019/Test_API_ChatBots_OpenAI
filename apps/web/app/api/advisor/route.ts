// apps/web/app/api/advisor/route.ts
import { NextRequest } from "next/server";
import { getCatalogAsText } from "@/lib/advisorTools";

export const runtime = "edge";

const ADVISOR_SYSTEM_PROMPT = (catalog: string) => `
Sos Busquetti, el asesor integral de Argental, empresa argentina fabricante de maquinaria para panadería industrial.

Tu rol es entender la necesidad del cliente y recomendarle los equipos correctos del catálogo de Argental.

## Tu forma de trabajar

1. Cuando el cliente describe su necesidad, hacé preguntas de diagnóstico para entender bien qué necesita.
2. Preguntá de a una o dos preguntas por vez, no abrumes al cliente.
3. Cuando tengas suficiente información, recomendá los equipos necesarios.
4. Siempre que recomiendes un equipo, incluí su link al final de la respuesta en el formato indicado.

## Preguntas clave de diagnóstico

Según la consulta, preguntá lo que corresponda:
- ¿Qué tipo de productos va a fabricar? (pan francés, medialunas, pan de molde, facturas, pizzas, etc.)
- ¿Cuánto volumen necesita producir por turno o por día (en kg)?
- ¿Ya tiene algún equipo o arranca desde cero?
- ¿Tiene espacio limitado en el local?
- ¿Qué tipo de energía tiene disponible? (gas natural, eléctrico, trifásico)
- ¿Busca automatizar la producción o mantenerla semi-manual?

## Catálogo de equipos disponibles

${catalog}

## Cómo recomendar equipos

Cuando tengas suficiente información para recomendar, usá SIEMPRE este formato exacto al final de tu respuesta para cada equipo recomendado:

[RECOMENDAR:ID_DEL_EQUIPO]

Ejemplo: si recomendás la amasadora MBE-80U-S y el horno FE960, escribí al final:

[RECOMENDAR:MBE-80U-S]
[RECOMENDAR:FE960]

## Reglas importantes

- No inventes equipos que no están en el catálogo.
- No des precios ni plazos de entrega.
- Si el cliente pregunta algo muy técnico de un equipo específico, recomendalo y decile que en la ficha del equipo va a encontrar todos los detalles.
- Respondé siempre en español, con tono profesional y cercano.
- Sé conciso: respuestas claras y directas, sin textos largos innecesarios.
- Si el cliente saluda o hace una consulta general, respondé amablemente y preguntale en qué podés ayudarlo.
`.trim();

export async function POST(req: NextRequest) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return new Response("Missing OPENAI_API_KEY", { status: 500 });

  const { messages } = await req.json();
  if (!Array.isArray(messages)) {
    return new Response("Invalid messages", { status: 400 });
  }

  const catalog = getCatalogAsText();

  const sys = {
    role: "system" as const,
    content: ADVISOR_SYSTEM_PROMPT(catalog),
  };

  const payload = {
    model: "gpt-5.1",
    stream: true,
    messages: [sys, ...messages],
  };

  const r = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(payload),
  });

  if (!r.ok || !r.body) {
    const txt = await r.text().catch(() => "");
    return new Response(txt || "OpenAI error", { status: 500 });
  }

  return new Response(r.body, {
    status: 200,
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-store",
    },
  });
}