import type { LLMProvider } from '../providers/types.js';

export interface PairForFilter {
  from: { id: string; content: string };
  to:   { id: string; content: string };
}

export interface Stage1Result {
  pass: boolean;
  comment: string;
  cost_usd: number;
}

const STAGE1_SYSTEM = `You are a filter that decides whether two memories MIGHT have a meaningful structural relation worth deeper analysis.

Reply with one line in this exact format:
  YES — <brief reason>
  NO — <brief reason>

Say YES if the two memories appear to make claims about overlapping things — e.g., they recommend or contradict each other on the same subject, one is a refinement of the other, or one depends on the other. Say NO if they describe distinct, non-conflicting things despite sharing topic tags. Reply with ONLY the single line — no other text.`;

const STAGE1_MAX_OUTPUT_TOKENS = 64;

export function parseStage1Response(text: string): { pass: boolean; comment: string } {
  const trimmed = text.trim();
  const match = trimmed.match(/^(YES|NO)(?:\s*[—\-:]\s*(.*))?$/i);
  if (!match) {
    throw new Error(`Stage 1 response not parseable: ${JSON.stringify(text)}`);
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
  const result = await provider.complete({
    model: 'haiku',
    system: STAGE1_SYSTEM,
    prompt: userPrompt,
    max_tokens: STAGE1_MAX_OUTPUT_TOKENS,
  });
  const parsed = parseStage1Response(result.response);
  return { pass: parsed.pass, comment: parsed.comment, cost_usd: result.cost_usd };
}
