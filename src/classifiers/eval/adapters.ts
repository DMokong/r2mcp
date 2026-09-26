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

const STAGE2_CHOICE_INSTRUCTIONS =
  'Classify the structural relation between memory A and memory B. "supports": B reinforces ' +
  'or is consistent with A. "contradicts": A and B make conflicting factual claims about the ' +
  'same subject (never for a rejection-typed memory — that is a meta-statement, not a factual ' +
  'claim). "supersedes": A explicitly replaces B as the current framing (A is newer). ' +
  '"evolved_into": A is a refined version of B with the same core intent. "depends_on": A ' +
  'presupposes B\'s truth. "related_to": same general topic but no stronger relation applies ' +
  '— the weakest signal, avoid unless no stronger relation fits. "none": no meaningful relation.';

const STAGE2_LABELS: Record<string, string | null> = Object.fromEntries(
  STAGE2_RELATIONS.map((relation) => [relation, null]),
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
