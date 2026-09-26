import { describe, it, expect } from 'vitest';
import { emptyAccumulator, judgeRecord, pushJudgments, stage2IsNeeded } from '../../src/classifiers/eval/judgments.js';

describe('stage2IsNeeded (fix #5)', () => {
  it('is needed when Stage 1 passed, regardless of ground truth', () => {
    expect(stage2IsNeeded(0.9, null)).toBe(true);
  });

  it('is needed for the fixed cohort even when Stage 1 rejected, as long as ground truth is known', () => {
    expect(stage2IsNeeded(0.1, 'supports')).toBe(true);
  });

  it('is not needed when Stage 1 rejected and ground truth is unknown', () => {
    expect(stage2IsNeeded(0.1, null)).toBe(false);
  });
});

describe('judgeRecord — fixed cohort vs. cascade separation (fix #5)', () => {
  it('cascade counts a Stage-1 reject as a "none" prediction — a miss against a real relation', () => {
    const j = judgeRecord({
      pairId: 'p1',
      groundTruthRelation: 'supports',
      groundTruthStage1Pass: true,
      stage1Probability: 0.1, // Stage 1 wrongly rejects a real relation
      stage2: { relation: 'supports', confidence: 0.95 }, // fixed-cohort still ran Stage 2 independently
    });
    expect(j.cascadeSample).toEqual({ pairId: 'p1', actual: 'supports', predicted: 'none' });
    // But the fixed-cohort report shows Stage 2 itself would have gotten it right.
    expect(j.stage2Sample).toEqual({ pairId: 'p1', actual: 'supports', predicted: 'supports' });
  });

  it('cascade predicts the actual Stage-2 relation when Stage 1 passes', () => {
    const j = judgeRecord({
      pairId: 'p2',
      groundTruthRelation: 'contradicts',
      groundTruthStage1Pass: true,
      stage1Probability: 0.9,
      stage2: { relation: 'related_to', confidence: 0.4 },
    });
    expect(j.cascadeSample).toEqual({ pairId: 'p2', actual: 'contradicts', predicted: 'related_to' });
    expect(j.stage2Sample).toEqual({ pairId: 'p2', actual: 'contradicts', predicted: 'related_to' });
  });

  it('includes a true "none" pair in the cascade (not just real relations)', () => {
    const j = judgeRecord({
      pairId: 'p3',
      groundTruthRelation: 'none',
      groundTruthStage1Pass: false,
      stage1Probability: 0.05, // correctly rejected
    });
    expect(j.cascadeSample).toEqual({ pairId: 'p3', actual: 'none', predicted: 'none' });
    expect(j.stage2Sample).toBeUndefined(); // Stage 1 correctly rejected; fixed cohort still needs a ground truth
  });

  it('omits relation samples entirely when ground truth is unknown', () => {
    const j = judgeRecord({
      pairId: 'p4',
      groundTruthRelation: null,
      groundTruthStage1Pass: null,
      stage1Probability: 0.7,
      stage2: { relation: 'supports', confidence: 0.8 },
    });
    expect(j.cascadeSample).toBeUndefined();
    expect(j.stage2Sample).toBeUndefined();
    expect(j.stage1Sample).toBeUndefined();
  });
});

describe('judgeRecord — Stage-1 calibration (fix #6)', () => {
  it('transforms noul p into {yes:p, no:1-p} and scores max(p,1-p) against correctness', () => {
    const correctReject = judgeRecord({
      pairId: 'p5',
      groundTruthRelation: null,
      groundTruthStage1Pass: false,
      stage1Probability: 0.2, // argmax is "no" (0.8), and ground truth is indeed "no"
    });
    expect(correctReject.stage1Calibration).toEqual({ confidence: 0.8, correct: true });

    const wrongPass = judgeRecord({
      pairId: 'p6',
      groundTruthRelation: null,
      groundTruthStage1Pass: false,
      stage1Probability: 0.9, // argmax is "yes" (0.9), but ground truth is "no"
    });
    expect(wrongPass.stage1Calibration).toEqual({ confidence: 0.9, correct: false });
  });

  it('populates stage1Temperature as a {yes,no} distribution against the true yes/no label (finding C)', () => {
    const j = judgeRecord({ pairId: 'p5b', groundTruthRelation: null, groundTruthStage1Pass: true, stage1Probability: 0.7 });
    expect(j.stage1Temperature?.trueLabel).toBe('yes');
    expect(j.stage1Temperature?.probabilities.yes).toBeCloseTo(0.7, 10);
    expect(j.stage1Temperature?.probabilities.no).toBeCloseTo(0.3, 10);

    const rejected = judgeRecord({ pairId: 'p5c', groundTruthRelation: null, groundTruthStage1Pass: false, stage1Probability: 0.7 });
    expect(rejected.stage1Temperature?.trueLabel).toBe('no');
  });

  it('omits Stage-1 samples when Stage-1 ground truth is unknown', () => {
    const j = judgeRecord({ pairId: 'p7', groundTruthRelation: null, groundTruthStage1Pass: null, stage1Probability: 0.5 });
    expect(j.stage1Sample).toBeUndefined();
    expect(j.stage1Calibration).toBeUndefined();
    expect(j.stage1Temperature).toBeUndefined();
  });
});

describe('judgeRecord — Stage-2 temperature only with a full distribution', () => {
  it('populates stage2Temperature when probabilities are given (classifier backends)', () => {
    const j = judgeRecord({
      pairId: 'p8',
      groundTruthRelation: 'supports',
      groundTruthStage1Pass: true,
      stage1Probability: 0.9,
      stage2: { relation: 'supports', confidence: 0.7, probabilities: { supports: 0.7, none: 0.3 } },
    });
    expect(j.stage2Temperature).toEqual({ probabilities: { supports: 0.7, none: 0.3 }, trueLabel: 'supports' });
  });

  it('omits stage2Temperature when only a scalar confidence is available (the raw LLM path)', () => {
    const j = judgeRecord({
      pairId: 'p9',
      groundTruthRelation: 'supports',
      groundTruthStage1Pass: true,
      stage1Probability: 0.9,
      stage2: { relation: 'supports', confidence: 0.7 },
    });
    expect(j.stage2Temperature).toBeUndefined();
    expect(j.stage2Calibration).toEqual({ confidence: 0.7, correct: true });
  });
});

describe('pushJudgments / emptyAccumulator', () => {
  it('accumulates only the buckets a judgment actually populated', () => {
    const acc = emptyAccumulator();
    pushJudgments(
      acc,
      judgeRecord({ pairId: 'p10', groundTruthRelation: 'none', groundTruthStage1Pass: false, stage1Probability: 0.1 }),
    );
    expect(acc.cascade).toHaveLength(1);
    expect(acc.stage1).toHaveLength(1);
    expect(acc.stage2).toHaveLength(0);
    expect(acc.stage2Temperature).toHaveLength(0);
  });
});
