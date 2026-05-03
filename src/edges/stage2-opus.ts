import type { EdgeAnthropicClient } from './anthropic-client.js';
import type { EdgeRelation } from './types.js';

export interface MemoryForClassify {
  id: string;
  content: string;
  type: string;
}

export interface PairForClassify {
  from: MemoryForClassify;
  to:   MemoryForClassify;
}

export type Stage2Result =
  | { kind: 'rejection_skip'; reason: string }
  | { kind: 'classified'; relation: EdgeRelation | 'none'; confidence: number; rationale: string; cost_usd: number };

export const STAGE2_RELATIONS: ReadonlyArray<EdgeRelation | 'none'> = [
  'supports', 'contradicts', 'supersedes', 'evolved_into', 'depends_on', 'related_to', 'none',
];

const STAGE2_SYSTEM = `You classify the structural relation between two memories. Respond with JSON only.

Possible relations:
  - supports: B reinforces or is consistent with A
  - contradicts: A and B make conflicting factual claims about the same subject
  - supersedes: A explicitly replaces B as the current framing (newer A, older B)
  - evolved_into: A is a refined version of B with the same core intent
  - depends_on: A presupposes B's truth
  - related_to: A and B are about the same general topic but no stronger relation applies
  - none: no meaningful relation

Use "supersedes" with from=A=newer, to=B=older.

Use "contradicts" only for genuinely conflicting claims. Do NOT mark superseded pairs as contradictions.

Avoid "related_to" unless you are sure no stronger relation fits — it is the weakest signal.

Reply with a single JSON object: {"relation": <one of the seven>, "confidence": <0..1>, "rationale": "<one sentence>"}`;

const STAGE2_MAX_OUTPUT_TOKENS = 256;

/**
 * AC10: rejection-typed memories are out-of-vocabulary for contradicts (and for
 * structural classification in general — they are standalone facts, not nodes).
 * Skip if EITHER memory in the pair is a rejection.
 */
export function shouldSkipForRejection(
  a: { type: string },
  b: { type: string },
): boolean {
  return a.type === 'rejection' || b.type === 'rejection';
}

export function parseStage2Response(text: string): {
  relation: EdgeRelation | 'none';
  confidence: number;
  rationale: string;
} {
  // Strip optional ```json fences
  const cleaned = text.trim().replace(/^```(?:json)?\s*/, '').replace(/\s*```\s*$/, '').trim();
  let parsed: unknown;
  try {
    parsed = JSON.parse(cleaned);
  } catch (err) {
    throw new Error(`Stage 2 response is not JSON: ${JSON.stringify(text).slice(0, 200)}`);
  }
  if (!parsed || typeof parsed !== 'object') {
    throw new Error('Stage 2 response is not an object');
  }
  const obj = parsed as Record<string, unknown>;
  const relation = String(obj.relation ?? '').toLowerCase() as EdgeRelation | 'none';
  if (!STAGE2_RELATIONS.includes(relation)) {
    throw new Error(`Stage 2 returned invalid relation: ${obj.relation}`);
  }
  const confidence = Number(obj.confidence ?? 0);
  const rationale = String(obj.rationale ?? '').trim();
  return { relation, confidence, rationale };
}

export async function stage2OpusClassify(
  client: EdgeAnthropicClient,
  pair: PairForClassify,
): Promise<Stage2Result> {
  if (shouldSkipForRejection(pair.from, pair.to)) {
    return {
      kind: 'rejection_skip',
      reason: 'rejection memories are out-of-vocabulary for contradicts (AC10)',
    };
  }
  const userPrompt = `Memory A (id=${pair.from.id}, type=${pair.from.type}): ${pair.from.content}\n\nMemory B (id=${pair.to.id}, type=${pair.to.type}): ${pair.to.content}`;
  const result = await client.complete('opus', STAGE2_SYSTEM, userPrompt, STAGE2_MAX_OUTPUT_TOKENS);
  const parsed = parseStage2Response(result.text);
  return {
    kind: 'classified',
    relation: parsed.relation,
    confidence: parsed.confidence,
    rationale: parsed.rationale,
    cost_usd: result.cost_usd,
  };
}
