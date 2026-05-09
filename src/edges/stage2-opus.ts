import type { LLMProvider } from '../providers/types.js';
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
  | { kind: 'classified'; relation: EdgeRelation | 'none'; confidence: number; rationale: string; cost_usd: number; downgraded?: boolean };

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

Rejection-typed memories rule: if memory A or B has type=rejection, you must NOT use "contradicts". A rejection ("don't do X") is a meta-statement about what to avoid, not a factual claim that can conflict with another claim. For rejection-involving pairs, prefer "related_to", "evolved_into", "supersedes", "depends_on", or "none".

Avoid "related_to" unless you are sure no stronger relation fits — it is the weakest signal.

Reply with a single JSON object: {"relation": <one of the seven>, "confidence": <0..1>, "rationale": "<one sentence>"}`;

const STAGE2_MAX_OUTPUT_TOKENS = 256;

/**
 * AC10: rejection-typed memories are out-of-vocabulary for the `contradicts` relation
 * (a rejection is a meta-statement, not a factual claim). They CAN participate in
 * other relations like related_to, evolved_into, supersedes — a rejection often
 * pairs with a preference saying the same thing in positive form.
 *
 * Used by stage2OpusClassify as a post-call guard: if the LLM returns "contradicts"
 * for a rejection pair (despite being instructed otherwise in the system prompt),
 * the result is downgraded to "none".
 */
export function isRejectionPair(
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
  } catch {
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
  provider: LLMProvider,
  pair: PairForClassify,
): Promise<Stage2Result> {
  const userPrompt = `Memory A (id=${pair.from.id}, type=${pair.from.type}): ${pair.from.content}\n\nMemory B (id=${pair.to.id}, type=${pair.to.type}): ${pair.to.content}`;
  const result = await provider.complete({
    model: 'opus',
    system: STAGE2_SYSTEM,
    prompt: userPrompt,
    max_tokens: STAGE2_MAX_OUTPUT_TOKENS,
  });
  const parsed = parseStage2Response(result.response);

  // AC10 guard: if the LLM returns contradicts despite being told not to for rejection
  // pairs, downgrade to 'none'. The system prompt is the primary defense; this is a fallback.
  if (parsed.relation === 'contradicts' && isRejectionPair(pair.from, pair.to)) {
    return {
      kind: 'classified',
      relation: 'none',
      confidence: parsed.confidence,
      rationale: `[AC10] downgraded contradicts→none for rejection pair; original rationale: ${parsed.rationale}`,
      cost_usd: result.cost_usd,
      downgraded: true,
    };
  }

  return {
    kind: 'classified',
    relation: parsed.relation,
    confidence: parsed.confidence,
    rationale: parsed.rationale,
    cost_usd: result.cost_usd,
  };
}
