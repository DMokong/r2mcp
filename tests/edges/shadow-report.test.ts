import { describe, expect, it } from 'vitest';
import { summarizeShadow } from '../../src/edges/shadow-report.js';
import type { ShadowRecord } from '../../src/edges/stage1-shadow.js';

const rec = (primary_pass: boolean, p?: number, extra: Partial<ShadowRecord> = {}): ShadowRecord => ({
  ts: '2026-09-28T04:00:00Z',
  scope: 'claudeclaw',
  from_id: `f${p}`,
  to_id: `t${p}`,
  primary_pass,
  backend: 'typesafe',
  ...(p === undefined ? {} : { p, cost_usd: 0.00004, latency_ms: 200 }),
  ...extra,
});

describe('summarizeShadow', () => {
  const s = summarizeShadow([
    rec(true, 0.9),
    rec(false, 0.8), // classifier-only pass at 0.5 and 0.7 -> candidate missed edge
    rec(false, 0.1),
    rec(true, 0.4), // LLM-only pass at 0.5 and 0.7
    rec(false, undefined, { skipped: 'topic:health' }),
    rec(false, undefined, { error: '529' }),
  ]);
  it('counts scored, skipped by kind, errors and cost', () => {
    expect(s).toMatchObject({ records: 6, scored: 4, skipped: { topic: 1 }, errors: 1, latency_p50_ms: 200 });
    expect(s.cost_usd).toBeCloseTo(0.00016);
  });
  it('splits disagreement by direction per threshold', () => {
    expect(s.by_threshold.find((t) => t.threshold === 0.5)).toEqual({
      threshold: 0.5,
      agree: 2,
      classifier_only_pass: 1,
      llm_only_pass: 1,
    });
    expect(s.by_threshold.find((t) => t.threshold === 0.3)).toMatchObject({ agree: 3, classifier_only_pass: 1, llm_only_pass: 0 });
  });
  it('lists candidate missed edges strongest first', () => {
    expect(s.candidate_missed_edges).toEqual([{ from_id: 'f0.8', to_id: 't0.8', p: 0.8, ts: '2026-09-28T04:00:00Z' }]);
  });
});
