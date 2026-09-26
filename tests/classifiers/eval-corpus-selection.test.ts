import { describe, it, expect } from 'vitest';
import { coverageWarning, intersectLabelsWithCorpus, selectRecords } from '../../src/classifiers/eval/corpus-selection.js';
import type { CorpusRecord } from '../../src/classifiers/eval/corpus-schema.js';

function record(pairId: string, relation: CorpusRecord['relation'] = null): CorpusRecord {
  return {
    pair_id: pairId,
    from: { id: `f-${pairId}`, content: 'from content', type: 'context' },
    to: { id: `t-${pairId}`, content: 'to content', type: 'context' },
    source: 'memory_edge',
    relation,
    confidence: null,
    stage1_pass: relation === null ? null : relation !== 'none',
  };
}

describe('selectRecords (finding A/1)', () => {
  const records = [
    record('s1', 'supports'),
    record('s2', 'supports'),
    record('s3', 'supports'),
    record('c1', 'contradicts'),
    record('n1', 'none'),
  ];

  it('returns the whole corpus when no limit is given', () => {
    expect(selectRecords(records, undefined, (r) => r.relation ?? 'unknown')).toHaveLength(5);
  });

  it('stratifies by the resolved label when a limit is given, so "none" is not starved out', () => {
    const limited = selectRecords(records, 2, (r) => r.relation ?? 'unknown');
    const labels = limited.map((r) => r.relation);
    // A plain prefix slice of 2 would be ['supports', 'supports'] — this must not be that.
    expect(new Set(labels).size).toBeGreaterThan(1);
  });
});

describe('intersectLabelsWithCorpus (finding B/9)', () => {
  const records = [record('p1', 'supports'), record('p2', null), record('p3', null)];

  it('returns only the corpus records with a matching label', () => {
    const labels = new Map([['p2', 'contradicts' as const]]);
    const matched = intersectLabelsWithCorpus(records, labels);
    expect(matched.map((r) => r.pair_id)).toEqual(['p2']);
  });

  it('throws on a label pair_id absent from the corpus', () => {
    const labels = new Map([['not-in-corpus', 'supports' as const]]);
    expect(() => intersectLabelsWithCorpus(records, labels)).toThrow(/not present in the corpus/);
  });

  it('throws when the labels map is empty — zero matches, not silently proceeding', () => {
    expect(() => intersectLabelsWithCorpus(records, new Map())).toThrow(/matched zero pairs/);
  });
});

describe('coverageWarning (finding B/9)', () => {
  it('warns below the minimum coverage threshold', () => {
    expect(coverageWarning(5)).toMatch(/only 5 labelled pair/);
  });

  it('is silent at or above the threshold', () => {
    expect(coverageWarning(30)).toBeNull();
    expect(coverageWarning(200)).toBeNull();
  });
});
