import { withEmbeddingSpan } from './telemetry.js';

const OPENROUTER_URL = 'https://openrouter.ai/api/v1/embeddings';
const DEFAULT_MODEL = 'openai/text-embedding-3-small';

export async function embedBatch(
  texts: string[],
  model: string = DEFAULT_MODEL
): Promise<number[][] | null> {
  const apiKey = process.env.R2MCP_OPENROUTER_API_KEY;
  if (!apiKey) {
    return null;
  }

  const totalChars = texts.reduce((sum, t) => sum + t.length, 0);
  return withEmbeddingSpan(texts.length, async () => {
    const res = await fetch(OPENROUTER_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
        'HTTP-Referer': 'https://github.com/DMokong/r2mcp',
        'X-Title': 'r2mcp',
      },
      body: JSON.stringify({ model, input: texts }),
    });

    if (!res.ok) {
      console.error(`OpenRouter embedding error ${res.status}: ${await res.text()}`);
      return null;
    }

    const data = await res.json();
    return data.data
      .sort((a: { index: number }, b: { index: number }) => a.index - b.index)
      .map((d: { embedding: number[] }) => d.embedding);
  }, totalChars);
}

export async function embedText(
  text: string,
  model: string = DEFAULT_MODEL
): Promise<number[] | null> {
  const result = await embedBatch([text], model);
  return result ? result[0] : null;
}
