import { describe, it, expect } from 'vitest';
import {
  normalizeFixtureRecord,
  normalizeDbRecord,
  parseHumanLabels,
} from '../../src/classifiers/eval/corpus-schema.js';

const rawMemory = (id: string) => ({ id, content: `content for ${id}`, type: 'context' });

describe('normalizeFixtureRecord (fix #1)', () => {
  it('maps expected_relation to relation and derives Stage-1 truth for a real relation', () => {
    const rec = normalizeFixtureRecord(
      { from: rawMemory('f1'), to: rawMemory('t1'), expected_relation: 'supports' },
      1,
    );
    expect(rec.relation).toBe('supports');
    expect(rec.stage1_pass).toBe(true);
    expect(rec.pair_id).toEqual(expect.any(String));
    expect(rec.pair_id.length).toBeGreaterThan(0);
  });

  it('maps a "none" expected_relation to Stage-1 truth = false, not an unknown', () => {
    const rec = normalizeFixtureRecord({ from: rawMemory('f2'), to: rawMemory('t2'), expected_relation: 'none' }, 2);
    expect(rec.relation).toBe('none');
    expect(rec.stage1_pass).toBe(false);
  });

  it('throws — never silently passes through — on a record missing expected_relation', () => {
    // This is exactly the round-1 bug: casting the fixture's own shape without validating
    // let every record's stage1_pass slip through as undefined, and undefined !== null.
    expect(() => normalizeFixtureRecord({ from: rawMemory('f3'), to: rawMemory('t3') }, 3)).toThrow(/line 3/);
  });

  it('throws on an invalid expected_relation value', () => {
    expect(() =>
      normalizeFixtureRecord({ from: rawMemory('f4'), to: rawMemory('t4'), expected_relation: 'maybe' }, 4),
    ).toThrow(/invalid "expected_relation"/);
  });

  it('throws on a malformed "from"/"to"', () => {
    expect(() =>
      normalizeFixtureRecord({ from: { id: 'f5' }, to: rawMemory('t5'), expected_relation: 'supports' }, 5),
    ).toThrow(/invalid or missing "from"/);
  });
});

describe('normalizeDbRecord', () => {
  const validDbRecord = {
    pair_id: 'abc123',
    from: rawMemory('f1'),
    to: rawMemory('t1'),
    source: 'memory_edge',
    relation: 'supports',
    confidence: 0.9,
    stage1_pass: true,
  };

  it('passes through a well-formed builder record', () => {
    const rec = normalizeDbRecord(validDbRecord, 1);
    expect(rec).toEqual(validDbRecord);
  });

  it('accepts null relation/confidence/stage1_pass (an unlabeled Stage-1 rejection)', () => {
    const rec = normalizeDbRecord(
      { ...validDbRecord, relation: null, confidence: null, stage1_pass: false, source: 'stage1_rejected' },
      2,
    );
    expect(rec.relation).toBeNull();
    expect(rec.stage1_pass).toBe(false);
  });

  it('throws on a missing pair_id', () => {
    expect(() => normalizeDbRecord({ ...validDbRecord, pair_id: undefined }, 3)).toThrow(/pair_id/);
  });

  it('throws on an invalid source', () => {
    expect(() => normalizeDbRecord({ ...validDbRecord, source: 'made_up' }, 4)).toThrow(/invalid "source"/);
  });

  it('throws on an invalid relation', () => {
    expect(() => normalizeDbRecord({ ...validDbRecord, relation: 'made_up' }, 5)).toThrow(/invalid "relation"/);
  });
});

describe('parseHumanLabels (fix #2)', () => {
  it('builds a pair_id -> label map, skipping unlabeled rows', () => {
    const jsonl = [
      JSON.stringify({ pair_id: 'p1', human_label: 'supports' }),
      JSON.stringify({ pair_id: 'p2', human_label: null }),
      JSON.stringify({ pair_id: 'p3', human_label: 'none' }),
    ].join('\n');
    const map = parseHumanLabels(jsonl);
    expect(map.get('p1')).toBe('supports');
    expect(map.has('p2')).toBe(false);
    expect(map.get('p3')).toBe('none');
    expect(map.size).toBe(2);
  });

  it('throws on an invalid human_label rather than treating it as unlabeled', () => {
    const jsonl = JSON.stringify({ pair_id: 'p1', human_label: 'not-a-relation' });
    expect(() => parseHumanLabels(jsonl)).toThrow(/invalid "human_label"/);
  });

  it('throws on a row missing pair_id', () => {
    const jsonl = JSON.stringify({ human_label: 'supports' });
    expect(() => parseHumanLabels(jsonl)).toThrow(/pair_id/);
  });
});
