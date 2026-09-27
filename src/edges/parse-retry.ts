import type { CompleteResponse } from '../providers/types.js';

/**
 * trk-6qd: an LLM reply that cannot be parsed (empty, or cut off before any
 * usable field) used to drop the pair silently. Ask once more before giving
 * up; the cost of every attempt is counted.
 */
export async function completeAndParse<T>(
  call: () => Promise<CompleteResponse>,
  parse: (text: string) => T,
  attempts = 2,
): Promise<{ parsed: T; cost_usd: number }> {
  let cost = 0;
  let lastError: unknown;
  for (let i = 0; i < attempts; i++) {
    const result = await call();
    cost += result.cost_usd;
    try {
      return { parsed: parse(result.response), cost_usd: cost };
    } catch (err) {
      lastError = err;
    }
  }
  throw lastError;
}
