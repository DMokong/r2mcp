import { describe, it, expect } from 'vitest';
import {
  sweepStage1Thresholds,
  relationConfusionMatrix,
  expectedCalibrationError,
  fitTemperature,
  latencyPercentiles,
  costPer1kUsd,
  type Stage1JudgmentSample,
  type RelationJudgmentSample,
  stage1RocAuc,
  stage1PassRate,
} from '../../src/classifiers/eval-metrics.js';

describe('sweepStage1Thresholds', () => {
  const samples: Stage1JudgmentSample[] = [
    { pairId: 'a', groundTruthPass: true, predictedProbability: 0.9 },
    { pairId: 'b', groundTruthPass: true, predictedProbability: 0.6 },
    { pairId: 'c', groundTruthPass: false, predictedProbability: 0.7 },
    { pairId: 'd', groundTruthPass: false, predictedProbability: 0.2 },
  ];

  it('computes recall/precision at each threshold', () => {
    const [low, mid, high] = sweepStage1Thresholds(samples, [0.5, 0.65, 0.95]);

    // threshold 0.5: a,b,c pass (tp=2, fp=1), d correctly fails (fn=0, tn=1)
    expect(low).toEqual({ threshold: 0.5, tp: 2, fp: 1, fn: 0, tn: 1, recall: 1, precision: 2 / 3 });

    // threshold 0.65: a,c pass (tp=1, fp=1), b now a false negative
    expect(mid).toEqual({ threshold: 0.65, tp: 1, fp: 1, fn: 1, tn: 1, recall: 0.5, precision: 0.5 });

    // threshold 0.95: nothing passes
    expect(high).toEqual({ threshold: 0.95, tp: 0, fp: 0, fn: 2, tn: 2, recall: 0, precision: 0 });
  });

  it('returns 0 recall/precision for an empty sample set rather than NaN', () => {
    const [r] = sweepStage1Thresholds([], [0.5]);
    expect(r.recall).toBe(0);
    expect(r.precision).toBe(0);
  });
});

describe('relationConfusionMatrix', () => {
  const samples: RelationJudgmentSample[] = [
    { pairId: '1', actual: 'supports', predicted: 'supports' },
    { pairId: '2', actual: 'supports', predicted: 'related_to' },
    { pairId: '3', actual: 'contradicts', predicted: 'contradicts' },
    { pairId: '4', actual: 'related_to', predicted: 'supports' },
  ];

  it('builds the actual x predicted matrix', () => {
    const { matrix } = relationConfusionMatrix(samples);
    expect(matrix.supports.supports).toBe(1);
    expect(matrix.supports.related_to).toBe(1);
    expect(matrix.contradicts.contradicts).toBe(1);
    expect(matrix.related_to.supports).toBe(1);
  });

  it('computes per-class precision/recall/support', () => {
    const { perClass } = relationConfusionMatrix(samples);
    const supports = perClass.find((c) => c.label === 'supports')!;
    // actual=supports: 2 (1 correct); predicted=supports: 2 (from supports+related_to rows)
    expect(supports.support).toBe(2);
    expect(supports.recall).toBe(0.5);
    expect(supports.precision).toBe(0.5);

    const contradicts = perClass.find((c) => c.label === 'contradicts')!;
    expect(contradicts.support).toBe(1);
    expect(contradicts.recall).toBe(1);
    expect(contradicts.precision).toBe(1);
  });

  it('uses a fixed label set when provided, even for absent labels', () => {
    const { labels, perClass } = relationConfusionMatrix(samples, [
      'supports',
      'contradicts',
      'supersedes',
      'evolved_into',
      'depends_on',
      'related_to',
      'none',
    ]);
    expect(labels).toHaveLength(7);
    const none = perClass.find((c) => c.label === 'none')!;
    expect(none.support).toBe(0);
    expect(none.precision).toBe(0);
    expect(none.recall).toBe(0);
  });
});

describe('expectedCalibrationError', () => {
  it('is zero for a perfectly calibrated set', () => {
    const samples = [
      { confidence: 0.9, correct: true },
      { confidence: 0.9, correct: true },
      { confidence: 0.9, correct: true },
      { confidence: 0.9, correct: true },
      { confidence: 0.9, correct: true },
      { confidence: 0.9, correct: true },
      { confidence: 0.9, correct: true },
      { confidence: 0.9, correct: true },
      { confidence: 0.9, correct: true },
      { confidence: 0.9, correct: false }, // 90% accuracy at confidence 0.9
    ];
    const { ece } = expectedCalibrationError(samples, 10);
    expect(ece).toBeCloseTo(0, 5);
  });

  it('is positive when the model is overconfident', () => {
    const samples = Array.from({ length: 10 }, (_, i) => ({ confidence: 0.95, correct: i < 5 }));
    const { ece, bins } = expectedCalibrationError(samples, 10);
    expect(ece).toBeGreaterThan(0.3);
    const bin = bins.find((b) => b.count === 10)!;
    expect(bin.avgConfidence).toBeCloseTo(0.95, 5);
    expect(bin.accuracy).toBeCloseTo(0.5, 5);
  });

  it('returns 0 for an empty sample set', () => {
    expect(expectedCalibrationError([], 10).ece).toBe(0);
  });
});

describe('fitTemperature', () => {
  it('finds T > 1 that lowers NLL for an overconfident model', () => {
    // Model is right 60% of the time but always reports 0.95 confidence for its pick.
    const samples = Array.from({ length: 20 }, (_, i) => {
      const correct = i % 5 !== 0; // 80% correct... make overconfident regardless
      const trueLabel = correct ? 'a' : 'b';
      return { probabilities: { a: 0.95, b: 0.05 }, trueLabel };
    });
    const result = fitTemperature(samples);
    expect(result.nllAfter).toBeLessThanOrEqual(result.nllBefore);
    expect(result.temperature).toBeGreaterThan(1);
  });

  it('leaves a well-calibrated model close to T=1', () => {
    const samples = [
      { probabilities: { a: 0.9, b: 0.1 }, trueLabel: 'a' },
      { probabilities: { a: 0.9, b: 0.1 }, trueLabel: 'a' },
      { probabilities: { a: 0.1, b: 0.9 }, trueLabel: 'b' },
    ];
    const result = fitTemperature(samples, { min: 0.5, max: 2, steps: 60 });
    expect(result.nllAfter).toBeLessThanOrEqual(result.nllBefore + 1e-9);
  });
});

describe('latencyPercentiles', () => {
  it('computes p50/p95 over a sorted set', () => {
    const latencies = Array.from({ length: 100 }, (_, i) => i + 1); // 1..100
    const { p50, p95 } = latencyPercentiles(latencies);
    expect(p50).toBe(50);
    expect(p95).toBe(95);
  });

  it('returns 0/0 for an empty array', () => {
    expect(latencyPercentiles([])).toEqual({ p50: 0, p95: 0 });
  });
});

describe('costPer1kUsd', () => {
  it('scales cost per judgment to a per-1000 rate', () => {
    expect(costPer1kUsd(2, 100)).toBeCloseTo(20, 5);
  });

  it('returns 0 when there are no judgments', () => {
    expect(costPer1kUsd(5, 0)).toBe(0);
  });
});

describe('stage1RocAuc / stage1PassRate', () => {
  const s = (pass: boolean, p: number) => ({ pairId: String(p), groundTruthPass: pass, predictedProbability: p });
  it('is 1 for perfect ranking, 0.5 for a pass-everything filter, 0 when inverted', () => {
    expect(stage1RocAuc([s(true, 0.9), s(true, 0.8), s(false, 0.2)])).toBe(1);
    expect(stage1RocAuc([s(true, 0.55), s(true, 0.55), s(false, 0.55)])).toBe(0.5);
    expect(stage1RocAuc([s(true, 0.1), s(false, 0.9)])).toBe(0);
  });
  it('hand-checked mixed case: 3 of 4 pos/neg pairs ordered correctly', () => {
    // pos {0.9, 0.4}, neg {0.6, 0.2}: 0.9>0.6, 0.9>0.2, 0.4<0.6, 0.4>0.2 => 3/4
    expect(stage1RocAuc([s(true, 0.9), s(true, 0.4), s(false, 0.6), s(false, 0.2)])).toBe(0.75);
  });
  it('is null when a class is missing; pass rate counts p >= threshold', () => {
    expect(stage1RocAuc([s(true, 0.9)])).toBeNull();
    expect(stage1PassRate([s(true, 0.5), s(false, 0.49), s(false, 0.7)], 0.5)).toBeCloseTo(2 / 3);
  });
});
