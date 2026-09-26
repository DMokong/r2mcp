/**
 * Per-record judgment aggregation (trk-7mx.1 review round 2, fix #5/#6).
 *
 * Pulled out of the CLI runner as a pure function so the two blockers found
 * in round 2 review are directly unit-testable without mocking a provider:
 *
 *   - fix #5: Stage-2 metrics were conditioned on each backend's own Stage-1
 *     pass, so a backend with a stricter Stage-1 looked like it had a better
 *     Stage-2 purely by filtering harder. This produces THREE separate
 *     buckets instead of one: a fixed-cohort Stage-2 report (run on every
 *     relation-labelled pair regardless of Stage-1), the end-to-end cascade
 *     (Stage-1 skips count as a 'none' prediction — a miss against any real
 *     relation — and true 'none' pairs are included), and Stage-1 alone.
 *   - fix #6: Stage-1 (a yes/no noul question) had no calibration metric.
 *     noul probability p becomes a two-way distribution {yes: p, no: 1-p};
 *     ECE is computed against max(p, 1-p) vs. whether that argmax matched
 *     ground truth, exactly like a Stage-2 top-1 calibration sample.
 */

import type {
  CalibrationSample,
  RelationJudgmentSample,
  RelationLabel,
  Stage1JudgmentSample,
  TemperatureFitSample,
} from '../eval-metrics.js';

export interface Stage2Input {
  relation: RelationLabel;
  confidence: number;
  /** Full label -> probability distribution. Only classifier backends (not the raw LLM path) have this. */
  probabilities?: Record<string, number>;
}

export interface JudgeRecordInput {
  pairId: string;
  /** null = unknown; 'none' = confirmed no relation; otherwise the confirmed relation. */
  groundTruthRelation: RelationLabel | null;
  /** null = unknown. Independent of groundTruthRelation for pipeline (circular) mode's rejected pairs. */
  groundTruthStage1Pass: boolean | null;
  /** P(yes) from the Stage-1 noul question (or 1/0 for a boolean gate). */
  stage1Probability: number;
  /** Present only if Stage 2 was actually invoked for this record (cascade-natural or fixed-cohort-forced). */
  stage2?: Stage2Input;
}

export interface RecordJudgments {
  stage1Sample?: Stage1JudgmentSample;
  stage1Calibration?: CalibrationSample;
  /** Fixed-cohort: Stage 2 scored on its own, independent of what Stage 1 decided. */
  stage2Sample?: RelationJudgmentSample;
  stage2Calibration?: CalibrationSample;
  stage2Temperature?: TemperatureFitSample;
  /** End-to-end: Stage-1 reject => predicted 'none' (a miss against any real relation). */
  cascadeSample?: RelationJudgmentSample;
}

/** Pure per-record scoring — no I/O, no provider calls. See module doc for the fixes this encodes. */
export function judgeRecord(input: JudgeRecordInput): RecordJudgments {
  const out: RecordJudgments = {};
  const predictedPass = input.stage1Probability >= 0.5;

  if (input.groundTruthStage1Pass !== null) {
    out.stage1Sample = {
      pairId: input.pairId,
      groundTruthPass: input.groundTruthStage1Pass,
      predictedProbability: input.stage1Probability,
    };
    out.stage1Calibration = {
      confidence: Math.max(input.stage1Probability, 1 - input.stage1Probability),
      correct: predictedPass === input.groundTruthStage1Pass,
    };
  }

  if (input.groundTruthRelation !== null) {
    const cascadePredicted: RelationLabel = predictedPass && input.stage2 ? input.stage2.relation : 'none';
    out.cascadeSample = { pairId: input.pairId, actual: input.groundTruthRelation, predicted: cascadePredicted };

    if (input.stage2) {
      out.stage2Sample = { pairId: input.pairId, actual: input.groundTruthRelation, predicted: input.stage2.relation };
      out.stage2Calibration = {
        confidence: input.stage2.confidence,
        correct: input.stage2.relation === input.groundTruthRelation,
      };
      if (input.stage2.probabilities) {
        out.stage2Temperature = {
          probabilities: input.stage2.probabilities,
          trueLabel: input.groundTruthRelation,
        };
      }
    }
  }

  return out;
}

export interface JudgmentAccumulator {
  stage1: Stage1JudgmentSample[];
  stage1Calibration: CalibrationSample[];
  stage2: RelationJudgmentSample[];
  stage2Calibration: CalibrationSample[];
  stage2Temperature: TemperatureFitSample[];
  cascade: RelationJudgmentSample[];
}

export function emptyAccumulator(): JudgmentAccumulator {
  return { stage1: [], stage1Calibration: [], stage2: [], stage2Calibration: [], stage2Temperature: [], cascade: [] };
}

export function pushJudgments(acc: JudgmentAccumulator, j: RecordJudgments): void {
  if (j.stage1Sample) acc.stage1.push(j.stage1Sample);
  if (j.stage1Calibration) acc.stage1Calibration.push(j.stage1Calibration);
  if (j.stage2Sample) acc.stage2.push(j.stage2Sample);
  if (j.stage2Calibration) acc.stage2Calibration.push(j.stage2Calibration);
  if (j.stage2Temperature) acc.stage2Temperature.push(j.stage2Temperature);
  if (j.cascadeSample) acc.cascade.push(j.cascadeSample);
}

/** Whether Stage 2 needs to run at all for this record: the cascade needs it if Stage 1 passed, and the
 * fixed-cohort report needs it whenever the true relation is known, regardless of what Stage 1 said. */
export function stage2IsNeeded(stage1Probability: number, groundTruthRelation: RelationLabel | null): boolean {
  return stage1Probability >= 0.5 || groundTruthRelation !== null;
}
