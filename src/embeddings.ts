import { withEmbeddingSpan } from './telemetry.js';

const OPENROUTER_URL = 'https://openrouter.ai/api/v1/embeddings';
const DEFAULT_MODEL = 'openai/text-embedding-3-small';

/**
 * claw-8cjf.2: a null embedding must be explainable in tool responses instead
 * of silently degrading the headline semantic-search feature.
 */
export const EMBEDDINGS_DISABLED_WARNING =
  'embeddings disabled: R2MCP_OPENROUTER_API_KEY is not set — memories store without ' +
  'embeddings and recall falls back to full-text. Set it in your .mcp.json "env" block ' +
  'or .env to enable semantic search.';

export const EMBEDDING_FAILED_WARNING =
  'embedding generation failed (see server stderr for the OpenRouter error) — this ' +
  'operation completed without an embedding; re-saving the content later will backfill it.';

/**
 * Explains a null embedding: disabled (no key) vs failed (key present).
 * Returns null when the embedding is present — no warning needed.
 */
export function embeddingWarning(embedding: ReadonlyArray<number> | null): string | null {
  if (embedding !== null) return null;
  return process.env.R2MCP_OPENROUTER_API_KEY
    ? EMBEDDING_FAILED_WARNING
    : EMBEDDINGS_DISABLED_WARNING;
}

export async function embedBatch(
  texts: string[],
  model: string = DEFAULT_MODEL,
): Promise<number[][] | null> {
  const apiKey = process.env.R2MCP_OPENROUTER_API_KEY;
  if (!apiKey) {
    return null;
  }

  const totalChars = texts.reduce((sum, t) => sum + t.length, 0);
  return withEmbeddingSpan(
    texts.length,
    async () => {
      const res = await fetch(OPENROUTER_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
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
    },
    totalChars,
  );
}

export async function embedText(
  text: string,
  model: string = DEFAULT_MODEL,
): Promise<number[] | null> {
  const result = await embedBatch([text], model);
  return result ? result[0] : null;
}
