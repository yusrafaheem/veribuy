export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed. Use POST." });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return res.status(500).json({
      error: "Missing ANTHROPIC_API_KEY env var.",
      fix: "Vercel Project → Settings → Environment Variables → add ANTHROPIC_API_KEY, then Redeploy."
    });
  }

  const { messages } = req.body || {};
  if (!Array.isArray(messages) || messages.length === 0) {
    return res.status(400).json({ error: "Missing or empty 'messages' array in request body." });
  }

  const cleanMessages = messages
    .filter((m) => m && typeof m.content === "string" && m.content.trim().length > 0)
    .map((m) => ({
      role: m.role === "assistant" ? "assistant" : "user",
      content: m.content.trim()
    }))
    .slice(-20);

  if (cleanMessages.length === 0) {
    return res.status(400).json({ error: "No valid messages found in request body." });
  }

  const systemPrompt =
    "You are the Veribuy AI beauty assistant. You help people find and evaluate makeup, skincare, and haircare products: matching them to skin type, tone, concerns, and budget, explaining ingredients, comparing dupes vs originals, and suggesting how to use products correctly. Keep answers short, warm, and practical, favor concrete product categories and ingredient callouts over vague advice, and note when someone should patch-test or check with a dermatologist for medical skin concerns. If asked about something unrelated to beauty, skincare, or shopping, gently steer back to how you can help with that.";

  try {
    const upstream = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01"
      },
      body: JSON.stringify({
        model: "claude-sonnet-5",
        max_tokens: 600,
        system: systemPrompt,
        messages: cleanMessages
      })
    });

    const data = await upstream.json();

    if (!upstream.ok) {
      return res.status(502).json({
        error: "Anthropic API request failed.",
        detail: data?.error?.message || JSON.stringify(data)
      });
    }

    const reply = Array.isArray(data.content)
      ? data.content.map((block) => (block.type === "text" ? block.text : "")).join("").trim()
      : "";

    if (!reply) {
      return res.status(502).json({ error: "Anthropic API returned an empty response." });
    }

    return res.status(200).json({ reply });
  } catch (err) {
    return res.status(500).json({ error: "Server error calling Anthropic API.", detail: String(err) });
  }
}
