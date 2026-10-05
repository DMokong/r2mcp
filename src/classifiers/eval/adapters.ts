/**
 * Adapts a memory pair into the two ClassifierProvider questions that stand
 * in for the existing Stage 1 / Stage 2 LLM path (trk-7mx.1):
 *   - Stage 1 (structural pre-filter) => a noul (bounded yes/no) question.
 *   - Stage 2 (relation classification) => a choice question over
 *     STAGE2_RELATIONS, mirroring stage2-opus.ts's own label set exactly so
 *     both paths are judged on the same vocabulary.
 */

import { STAGE2_RELATIONS } from '../../edges/stage2-opus.js';
import type { EdgeRelation } from '../../edges/types.js';
import type { ClassifierProvider, ClassifyRequest } from '../types.js';

export interface PairContent {
  from: { id: string; content: string; type: string };
  to: { id: string; content: string; type: string };
}

const STAGE1_NOUL_INSTRUCTIONS =
  'Decide whether these two memories might have a meaningful structural relation worth ' +
  'deeper analysis — e.g. they recommend or contradict each other on the same subject, one ' +
  'is a refinement of the other, or one depends on the other. Answer with the probability ' +
  'that a deeper analysis is worthwhile; answer low if they merely share topic tags but ' +
  'describe distinct, non-conflicting things.';

// Encoder backends (Laya/Verdict) read each option's own description far more
// than a long instruction, and options share a small token budget — so the
// definitions live on the options and the instruction stays short.
const STAGE2_CHOICE_INSTRUCTIONS =
  'How is memory A related to memory B? A rejection-typed memory never "contradicts" anything.';

const STAGE2_LABEL_DESCRIPTIONS: Record<EdgeRelation | 'none', string> = {
  supports: 'B reinforces or agrees with A',
  contradicts: 'A and B make conflicting claims about the same thing',
  supersedes: 'one replaces the other as the current version',
  evolved_into: 'one is a refined version of the other, same intent',
  depends_on: 'one presupposes the other',
  related_to: 'same topic, no stronger relation',
  none: 'unrelated',
};

const STAGE2_LABELS: Record<string, string | null> = Object.fromEntries(
  STAGE2_RELATIONS.map((relation) => [relation, STAGE2_LABEL_DESCRIPTIONS[relation]]),
);

function pairState(pair: PairContent, includeType: boolean): string {
  const from = includeType
    ? `Memory A (id=${pair.from.id}, type=${pair.from.type}): ${pair.from.content}`
    : `Memory A (id=${pair.from.id}): ${pair.from.content}`;
  const to = includeType
    ? `Memory B (id=${pair.to.id}, type=${pair.to.type}): ${pair.to.content}`
    : `Memory B (id=${pair.to.id}): ${pair.to.content}`;
  return `${from}\n\n${to}`;
}

export interface Stage1ClassifierResult {
  pass: boolean;
  probability: number;
  cost_usd: number;
  latency_ms: number;
}

/** Stage 1 as a classifier: a single noul question, thresholded at `threshold`. */
export async function classifyStage1AsNoul(
  provider: ClassifierProvider,
  pair: PairContent,
  threshold = 0.5,
): Promise<Stage1ClassifierResult> {
  const req: ClassifyRequest = {
    state: pairState(pair, false),
    questions: { stage1: { type: 'noul', instructions: STAGE1_NOUL_INSTRUCTIONS } },
  };
  const res = await provider.classify(req);
  const answer = res.answers.stage1;
  if (!answer || answer.type !== 'noul') {
    throw new Error(`${provider.name}: expected a noul answer for the stage1 question`);
  }
  return {
    pass: answer.noul >= threshold,
    probability: answer.noul,
    cost_usd: res.cost_usd,
    latency_ms: res.latency_ms,
  };
}

export interface Stage2ClassifierResult {
  relation: EdgeRelation | 'none';
  confidence: number;
  probabilities: Record<string, number>;
  cost_usd: number;
  latency_ms: number;
}

/** Stage 2 as a classifier: a choice question over STAGE2_RELATIONS. */
export async function classifyStage2AsChoice(
  provider: ClassifierProvider,
  pair: PairContent,
): Promise<Stage2ClassifierResult> {
  const req: ClassifyRequest = {
    state: pairState(pair, true),
    questions: {
      stage2: { type: 'choice', instructions: STAGE2_CHOICE_INSTRUCTIONS, labels: STAGE2_LABELS },
    },
  };
  const res = await provider.classify(req);
  const answer = res.answers.stage2;
  if (!answer || answer.type !== 'choice') {
    throw new Error(`${provider.name}: expected a choice answer for the stage2 question`);
  }
  return {
    relation: answer.choice as EdgeRelation | 'none',
    confidence: answer.confidence,
    probabilities: answer.probabilities,
    cost_usd: res.cost_usd,
    latency_ms: res.latency_ms,
  };
}
