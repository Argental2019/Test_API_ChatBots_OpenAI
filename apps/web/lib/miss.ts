export async function reportMiss(miss: any) {
  const base = (process.env.NEXT_PUBLIC_BACKEND_URL || "").replace(/\/$/, "");
  const url = base ? `${base}/api/agent/log-miss` : "/api/agent/log-miss";
  const r = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(miss),
  });
  if (!r.ok) console.warn("log-miss failed", await r.text());
}
