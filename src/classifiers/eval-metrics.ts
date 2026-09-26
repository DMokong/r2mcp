/**
 * Pure evaluation metrics for the classifier shadow-eval harness (trk-7mx.1).
 *
 * Every function here is a pure function over plain data — no DB, no LLM
 * calls, no filesystem — so the eval-classifiers CLI runner and its tests
 * can share the exact same math. Kept in one file since none of these are
 * complex enough on their own to warrant a directory.
 */

import type { EdgeRelation } from '../edges/types.js';

export type RelationLabel = EdgeRelation | 'none';

// ---------------------------------------------------------------------------
// Stage 1 recall/precision sweep
// ---------------------------------------------------------------------------

export interface Stage1JudgmentSample {
  pairId: string;
  /** True if the pair actually has a meaningful relation (should pass Stage 1). */
  groundTruthPass: boolean;
  /** P(yes) as returned by the classifier/noul question, or 1/0 for a boolean gate. */
  predictedProbability: number;
}

export interface ThresholdResult {
  threshold: number;
  tp: number;
  fp: number;
  fn: number;
  tn: number;
  recall: number;
  precision: number;
}

/** Sweeps Stage-1 pass/fail at each threshold, scoring against ground truth. */
export function sweepStage1Thresholds(
  samples: ReadonlyArray<Stage1JudgmentSample>,
  thresholds: ReadonlyArray<number>,
): ThresholdResult[] {
  return thresholds.map((threshold) => {
    let tp = 0;
    let fp = 0;
    let fn = 0;
    let tn = 0;
    for (const s of samples) {
      const predictedPass = s.predictedProbability >= threshold;
      if (predictedPass && s.groundTruthPass) tp++;
      else if (predictedPass && !s.groundTruthPass) fp++;
      else if (!predictedPass && s.groundTruthPass) fn++;
      else tn++;
    }
    return {
      threshold,
      tp,
      fp,
      fn,
      tn,
      recall: tp + fn > 0 ? tp / (tp + fn) : 0,
      precision: tp + fp > 0 ? tp / (tp + fp) : 0,
    };
  });
}

// ---------------------------------------------------------------------------
// Relation confusion matrix
// ---------------------------------------------------------------------------

export interface RelationJudgmentSample {
  pairId: string;
  actual: RelationLabel;
  predicted: RelationLabel;
}

export interface PerClassMetrics {
  label: RelationLabel;
  precision: number;
  recall: number;
  /** Number of samples whose ground truth is this label. */
  support: number;
}

export interface ConfusionMatrixResult {
  labels: RelationLabel[];
  /** matrix[actual][predicted] = count */
  matrix: Record<string, Record<string, number>>;
  perClass: PerClassMetrics[];
}

export function relationConfusionMatrix(
  samples: ReadonlyArray<RelationJudgmentSample>,
  labels?: ReadonlyArray<RelationLabel>,
): ConfusionMatrixResult {
  const labelSet = labels
    ? [...labels]
    : [...new Set(samples.flatMap((s) => [s.actual, s.predicted]))].sort();

  const matrix: Record<string, Record<string, number>> = {};
  for (const a of labelSet) {
    matrix[a] = {};
    for (const p of labelSet) matrix[a][p] = 0;
  }

  for (const s of samples) {
    matrix[s.actual] ??= {};
    matrix[s.actual][s.predicted] = (matrix[s.actual][s.predicted] ?? 0) + 1;
  }

  const perClass: PerClassMetrics[] = labelSet.map((label) => {
    const support = Object.values(matrix[label] ?? {}).reduce((a, b) => a + b, 0);
    const tp = matrix[label]?.[label] ?? 0;
    const predictedTotal = labelSet.reduce((sum, a) => sum + (matrix[a]?.[label] ?? 0), 0);
    return {
      label,
      support,
      recall: support > 0 ? tp / support : 0,
      precision: predictedTotal > 0 ? tp / predictedTotal : 0,
    };
  });

  return { labels: labelSet, matrix, perClass };
}

// ---------------------------------------------------------------------------
// Expected calibration error (ECE)
// ---------------------------------------------------------------------------

export interface CalibrationSample {
  /** Model's confidence in its own predicted label, 0..1. */
  confidence: number;
  /** Whether the predicted label matched ground truth. */
  correct: boolean;
}

export interface CalibrationBin {
  binStart: number;
  binEnd: number;
  count: number;
  avgConfidence: number;
  accuracy: number;
}

export interface ECEResult {
  ece: number;
  bins: CalibrationBin[];
}

export function expectedCalibrationError(
  samples: ReadonlyArray<CalibrationSample>,
  numBins = 10,
): ECEResult {
  const bins: CalibrationBin[] = Array.from({ length: numBins }, (_, i) => ({
    binStart: i / numBins,
    binEnd: (i + 1) / numBins,
    count: 0,
    avgConfidence: 0,
    accuracy: 0,
  }));

  const confidenceSums = new Array(numBins).fill(0);
  const correctSums = new Array(numBins).fill(0);

  for (const s of samples) {
    const idx = Math.min(numBins - 1, Math.max(0, Math.floor(s.confidence * numBins)));
    bins[idx].count++;
    confidenceSums[idx] += s.confidence;
    correctSums[idx] += s.correct ? 1 : 0;
  }

  let ece = 0;
  const total = samples.length;
  for (let i = 0; i < numBins; i++) {
    if (bins[i].count === 0) continue;
    bins[i].avgConfidence = confidenceSums[i] / bins[i].count;
    bins[i].accuracy = correctSums[i] / bins[i].count;
    ece += (bins[i].count / total) * Math.abs(bins[i].accuracy - bins[i].avgConfidence);
  }

  return { ece: total > 0 ? ece : 0, bins };
}

// ---------------------------------------------------------------------------
// Temperature scaling fit
// ---------------------------------------------------------------------------

export interface TemperatureFitSample {
  /** Keyed by label; sums to ~1 (a ChoiceAnswer/ScoreAnswer probabilities map). */
  probabilities: Record<string, number>;
  trueLabel: string;
}

export interface TemperatureFitResult {
  temperature: number;
  /** Mean negative log-likelihood at T=1 (the model's raw probabilities). */
  nllBefore: number;
  /** Mean negative log-likelihood at the fitted temperature. */
  nllAfter: number;
}

const EPSILON = 1e-12;

/**
 * Rescales probabilities by raising each to the power 1/T then renormalizing
 * (equivalent to dividing logits by T when probabilities came from a softmax),
 * and returns the mean NLL of the true label under that rescaling.
 */
function nllAtTemperature(samples: ReadonlyArray<TemperatureFitSample>, temperature: number): number {
  let total = 0;
  for (const s of samples) {
    const rescaled: Record<string, number> = {};
    let denom = 0;
    for (const [label, p] of Object.entries(s.probabilities)) {
      const v = Math.pow(Math.max(p, EPSILON), 1 / temperature);
      rescaled[label] = v;
      denom += v;
    }
    const pTrue = (rescaled[s.trueLabel] ?? EPSILON) / (denom || EPSILON);
    total += -Math.log(Math.max(pTrue, EPSILON));
  }
  return samples.length > 0 ? total / samples.length : 0;
}

/**
 * Grid search for the temperature T minimizing mean NLL. Hosted Jev is known
 * overconfident OOD (T>1 flattens overconfident distributions), so this is
 * fit locally against spot-checked ground truth rather than trusted as-is.
 */
export function fitTemperature(
  samples: ReadonlyArray<TemperatureFitSample>,
  opts: { min?: number; max?: number; steps?: number } = {},
): TemperatureFitResult {
  const min = opts.min ?? 0.25;
  const max = opts.max ?? 4;
  const steps = opts.steps ?? 150;

  const nllBefore = nllAtTemperature(samples, 1);

  let bestT = 1;
  let bestNll = nllBefore;
  for (let i = 0; i <= steps; i++) {
    const t = min + ((max - min) * i) / steps;
    const nll = nllAtTemperature(samples, t);
    if (nll < bestNll) {
      bestNll = nll;
      bestT = t;
    }
  }

  return { temperature: bestT, nllBefore, nllAfter: bestNll };
}

// ---------------------------------------------------------------------------
// Latency + cost
// ---------------------------------------------------------------------------

export interface LatencyPercentiles {
  p50: number;
  p95: number;
}

function percentile(sorted: ReadonlyArray<number>, p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.ceil(p * sorted.length) - 1));
  return sorted[idx];
}

export function latencyPercentiles(latenciesMs: ReadonlyArray<number>): LatencyPercentiles {
  const sorted = [...latenciesMs].sort((a, b) => a - b);
  return { p50: percentile(sorted, 0.5), p95: percentile(sorted, 0.95) };
}

/** Cost per 1,000 classifier judgments, in USD. */
export function costPer1kUsd(totalCostUsd: number, judgmentCount: number): number {
  return judgmentCount > 0 ? (totalCostUsd / judgmentCount) * 1000 : 0;
}
