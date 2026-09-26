import { describe, it, expect } from 'vitest';
import { roundRobinSample, stratifiedLimit } from '../../src/classifiers/eval/sampling.js';

describe('roundRobinSample', () => {
  it('interleaves evenly across strata', () => {
    const result = roundRobinSample([['a1', 'a2', 'a3'], ['b1', 'b2']], 4);
    expect(result).toEqual(['a1', 'b1', 'a2', 'b2']);
  });

  it('keeps drawing from remaining strata once one is exhausted', () => {
    const result = roundRobinSample([['a1'], ['b1', 'b2', 'b3']], 4);
    expect(result).toEqual(['a1', 'b1', 'b2', 'b3']);
  });

  it('stops early if every stratum is exhausted before reaching total', () => {
    const result = roundRobinSample([['a1'], ['b1']], 10);
    expect(result).toHaveLength(2);
  });
});

describe('stratifiedLimit (finding A/1)', () => {
  it('gives every group a fair share instead of a prefix slice', () => {
    // 5 supports, 5 contradicts, 2 none — a plain prefix slice of 3 would be all "supports".
    const records = [
      ...Array.from({ length: 5 }, (_, i) => ({ id: `s${i}`, label: 'supports' })),
      ...Array.from({ length: 5 }, (_, i) => ({ id: `c${i}`, label: 'contradicts' })),
      ...Array.from({ length: 2 }, (_, i) => ({ id: `n${i}`, label: 'none' })),
    ];
    const limited = stratifiedLimit(records, 6, (r) => r.label);
    const labels = limited.map((r) => r.label);
    expect(labels.filter((l) => l === 'none')).toHaveLength(2); // both 'none' records survive
    expect(labels.filter((l) => l === 'supports').length).toBeGreaterThan(0);
    expect(labels.filter((l) => l === 'contradicts').length).toBeGreaterThan(0);
    expect(limited).toHaveLength(6);
  });
});
