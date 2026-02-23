export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end();
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return res.status(500).json({ error: "ANTHROPIC_API_KEY not set in Vercel environment variables." });

  try {
    const { messages, useSearch } = req.body;
    const body = { model: "claude-sonnet-4-20250514", max_tokens: 1500, messages };
    if (useSearch) body.tools = [{ type: "web_search_20250305", name: "web_search" }];

    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": key, "anthropic-version": "2023-06-01" },
      body: JSON.stringify(body),
    });
    const data = await r.json();
    if (data.error) return res.status(400).json({ error: data.error.message });
    const text = data.content.filter(b => b.type === "text").map(b => b.text).join("\n");
    return res.status(200).json({ text });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
