import type { LLMProvider } from '../providers/types.js';
import { withLLMCallSpan } from '../telemetry.js';
import { resolveModelTier } from '../model-tier.js';
import { completeAndParse } from './parse-retry.js';

export interface PairForFilter {
  from: { id: string; content: string };
  to: { id: string; content: string };
}

export interface Stage1Result {
  pass: boolean;
  comment: string;
  cost_usd: number;
}

// trk-7mx.3: recall-biased. The previous wording ("say NO if they describe
// distinct, non-conflicting things despite sharing topic tags") rejected 41%
// of pairs a human labelled as related. A miss here is permanent (Stage 2
// never sees the pair); a false pass only costs one Stage-2 call, which can
// still answer "none".
const STAGE1_SYSTEM = `You are a cheap pre-filter in front of a careful relation classifier. Decide whether two memories MIGHT be related closely enough to be worth that deeper look.

Reply with one line in this exact format:
  YES — <brief reason>
  NO — <brief reason>

Say YES if they could plausibly be connected in any of these ways: one supports, contradicts, updates, replaces, refines, or depends on the other, or both are about the same specific subject, project, decision, or tool. Say NO only when they are clearly about different things. When unsure, say YES — the next stage makes the exact call and can still reject the pair. Reply with ONLY the single line — no other text.`;

const STAGE1_MAX_OUTPUT_TOKENS = 64;

export function parseStage1Response(text: string): { pass: boolean; comment: string } {
  // trk-6qd: models often wrap the verdict (multi-line reasons, **bold**, a
  // leading "Answer:"). Only the leading YES/NO token decides; everything
  // after it, across lines, is the comment.
  const flat = text.replace(/\s+/g, ' ').trim();
  const match = flat.match(
    /^[*_`"'\s]*(?:answer\s*:\s*)?[*_`"'\s]*(YES|NO)\b[*_`"']*\s*(?:[—\-:.,]\s*)?(.*)$/i,
  );
  if (!match) {
    throw new Error(`Stage 1 response not parseable: ${JSON.stringify(text).slice(0, 200)}`);
  }
  return {
    pass: match[1].toUpperCase() === 'YES',
    comment: (match[2] ?? '').trim(),
  };
}

export async function stage1HaikuFilter(
  provider: LLMProvider,
  pair: PairForFilter,
): Promise<Stage1Result> {
  const userPrompt = `Memory A (id=${pair.from.id}): ${pair.from.content}\n\nMemory B (id=${pair.to.id}): ${pair.to.content}`;
  // claw-1ejd: wrap the LLM call so the parent OTEL_TRACEPARENT context
  // has a concrete child span to inherit when this runs as a subprocess.
  // claw-x1mg: tier is env-resolvable and resolved once — the span attribute
  // and the request always report the same model. The filename still says
  // "haiku" for import stability; the shipped default is now sonnet.
  const model = resolveModelTier('classify-edges-stage1');
  const { parsed, cost_usd } = await completeAndParse(
    () =>
      withLLMCallSpan('memory.classify_edges.call', { provider: provider.name, model }, () =>
        provider.complete({
          model,
          system: STAGE1_SYSTEM,
          prompt: userPrompt,
          max_tokens: STAGE1_MAX_OUTPUT_TOKENS,
        }),
      ),
    parseStage1Response,
  );
  return { pass: parsed.pass, comment: parsed.comment, cost_usd };
}
