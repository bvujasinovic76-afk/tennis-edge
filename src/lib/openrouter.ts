const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";

export class OpenRouterError extends Error {
  constructor(message: string, public status?: number) {
    super(message);
    this.name = "OpenRouterError";
  }
}

/** Calls one model via OpenRouter and returns its parsed JSON response body. */
export async function callModelJson<T>(params: {
  model: string;
  systemPrompt: string;
  userPrompt: string;
  temperature?: number;
}): Promise<T> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    throw new OpenRouterError("OPENROUTER_API_KEY nije podešen (dodaj ga u .env.local).");
  }

  const res = await fetch(OPENROUTER_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "HTTP-Referer": "http://localhost:3000",
      "X-Title": "EDGE Tenis MVP",
    },
    body: JSON.stringify({
      model: params.model,
      temperature: params.temperature ?? 0.5,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: params.systemPrompt },
        { role: "user", content: params.userPrompt },
      ],
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new OpenRouterError(`OpenRouter (${params.model}) je vratio ${res.status}: ${body.slice(0, 300)}`, res.status);
  }

  const data = await res.json();
  const content: string | undefined = data?.choices?.[0]?.message?.content;
  if (!content) {
    throw new OpenRouterError(`OpenRouter (${params.model}) nije vratio sadržaj odgovora.`);
  }

  return parseJsonLoose<T>(content, params.model);
}

export type Citation = { url: string; title: string };

/** Calls a model with OpenRouter's live web-search plugin, returning prose + the sources it cited. */
export async function callModelWeb(params: {
  model: string;
  systemPrompt: string;
  userPrompt: string;
  maxResults?: number;
}): Promise<{ content: string; citations: Citation[] }> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) throw new OpenRouterError("OPENROUTER_API_KEY nije podešen (dodaj ga u .env.local).");

  const res = await fetch(OPENROUTER_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "HTTP-Referer": "http://localhost:3000",
      "X-Title": "EDGE Tenis MVP",
    },
    body: JSON.stringify({
      model: params.model,
      temperature: 0.3,
      plugins: [{ id: "web", max_results: params.maxResults ?? 4 }],
      messages: [
        { role: "system", content: params.systemPrompt },
        { role: "user", content: params.userPrompt },
      ],
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new OpenRouterError(`OpenRouter web (${params.model}) je vratio ${res.status}: ${body.slice(0, 300)}`, res.status);
  }

  const data = await res.json();
  const message = data?.choices?.[0]?.message;
  const content: string = message?.content ?? "";
  const annotations: Array<{ type: string; url_citation?: { url: string; title: string } }> = message?.annotations ?? [];
  const citations: Citation[] = annotations
    .filter((a) => a.type === "url_citation" && a.url_citation)
    .map((a) => ({ url: a.url_citation!.url, title: a.url_citation!.title || a.url_citation!.url }));

  return { content, citations };
}

/** Models occasionally wrap JSON in prose or code fences despite instructions — extract the object defensively. */
function parseJsonLoose<T>(content: string, model: string): T {
  try {
    return JSON.parse(content) as T;
  } catch {
    const match = content.match(/\{[\s\S]*\}/);
    if (match) {
      try {
        return JSON.parse(match[0]) as T;
      } catch {
        // fall through to error below
      }
    }
    throw new OpenRouterError(`Ne mogu da parsiram JSON odgovor od ${model}: ${content.slice(0, 300)}`);
  }
}
