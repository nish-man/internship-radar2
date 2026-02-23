export async function POST(req) {
  try {
    const body = await req.json();
    const { messages, useSearch } = body;

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": process.env.ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01"
      },
      body: JSON.stringify({
        model: "claude-3-haiku-20240307",
        max_tokens: 1200,
        messages,
        tools: useSearch ? [{
          name: "browser_search",
          description: "Search the web for live internship postings",
          input_schema: {
            type: "object",
            properties: {
              query: { type: "string" }
            },
            required: ["query"]
          }
        }] : undefined
      })
    });

    if (!response.ok) {
      const text = await response.text();
      return Response.json({ error: text }, { status: 500 });
    }

    const data = await response.json();

    return Response.json({
      text: data.content?.[0]?.text || ""
    });

  } catch (err) {
    return Response.json(
      { error: err.message || "Claude API failed" },
      { status: 500 }
    );
  }
}
