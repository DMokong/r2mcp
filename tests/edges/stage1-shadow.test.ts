import { describe, expect, it, vi } from 'vitest';
import { sensitiveReason, shadowStage1, type ShadowMemory } from '../../src/edges/stage1-shadow.js';
import type { ClassifierProvider } from '../../src/classifiers/types.js';

const mem = (content: string, topics: string[] = [], section: string | null = null, id = 'm'): ShadowMemory => ({
  id,
  content,
  topics,
  section,
});

describe('sensitiveReason — shapes of real health/finance memories', () => {
  it('blocks by topic, section, or text (untagged backstop)', () => {
    expect(sensitiveReason(mem('Dustin takes metformin for blood sugar.', ['health', 'medication']))).toBe('topic:health');
    expect(sensitiveReason(mem('Has a cold, tiredness.', [], 'Life Context'))).toBe('section:Life Context');
    expect(sensitiveReason(mem('Untagged: planning a fasting blood test next week.'))).toMatch(/^text:/);
    expect(sensitiveReason(mem('Pay the credit card before the 5th.', ['reminders']))).toBe('text:credit card');
    expect(sensitiveReason(mem('#cc-health went quiet', ['CC-Health']))).toBe('topic:CC-Health');
  });
  it('lets technical memories through, incl. job names that merely contain the words', () => {
    expect(sensitiveReason(mem('scripts/health-check.sh now probes OAuth; finance-ingest.sh runs at 03:00.', ['ops']))).toBeNull();
    expect(sensitiveReason(mem('webterm API now needs a bearer token.', ['webterm']))).toBeNull();
  });
  it('accepts false skips on technical homonyms — a skip only costs one shadow sample', () => {
    // `sdlc doctor` trips the backstop; deliberately not special-cased.
    expect(sensitiveReason(mem('Speculator v2.17: doctor --init enables all gates.', ['speculator']))).toBe('text:doctor');
  });
  it('honours extra blocked topics', () => {
    expect(sensitiveReason(mem('x', ['family']), ['family'])).toBe('topic:family');
  });
});

function classifier(egress: 'local' | 'remote', impl?: () => Promise<unknown>): ClassifierProvider {
  return {
    name: egress === 'remote' ? 'typesafe' : 'openjev',
    egress,
    concurrencyLimit: 1,
    classify: vi.fn(
      impl ??
        (async () => ({ answers: { stage1: { type: 'noul', noul: 0.91 } }, model: 'jev', cost_usd: 0.00004, latency_ms: 200 })),
    ) as ClassifierProvider['classify'],
  };
}

describe('shadowStage1', () => {
  const base = (c: ClassifierProvider, lines: string[]) => ({
    classifier: c,
    scope: 'claudeclaw',
    logPath: '/dev/null',
    now: () => new Date('2026-09-27T00:00:00Z'),
    append: (_p: string, line: string) => lines.push(line),
  });
  const primary = { pass: false, comment: 'no', cost_usd: 0 };

  it('never sends a sensitive pair to a remote classifier, and logs ids only', async () => {
    const lines: string[] = [];
    const c = classifier('remote');
    const r = await shadowStage1(base(c, lines), mem('Dustin takes metformin.', ['health'], null, 'a'), mem('ok', [], null, 'b'), primary);
    expect(c.classify).not.toHaveBeenCalled();
    expect(r.skipped).toBe('topic:health');
    expect(lines[0]).not.toContain('metformin');
    expect(JSON.parse(lines[0])).toMatchObject({ from_id: 'a', to_id: 'b', primary_pass: false, skipped: 'topic:health' });
  });

  it('scores a clean pair and records p, cost and latency', async () => {
    const lines: string[] = [];
    const r = await shadowStage1(base(classifier('remote'), lines), mem('webterm A', [], null, 'a'), mem('webterm B', [], null, 'b'), primary);
    expect(r).toMatchObject({ p: 0.91, cost_usd: 0.00004, latency_ms: 200, backend: 'typesafe' });
    expect(lines).toHaveLength(1);
  });

  it('a local classifier may see sensitive pairs (nothing leaves the machine)', async () => {
    const c = classifier('local');
    await shadowStage1(base(c, []), mem('metformin', ['health'], null, 'a'), mem('b', [], null, 'b'), primary);
    expect(c.classify).toHaveBeenCalledTimes(1);
  });

  it('never throws: a classifier error or a failing log write is recorded or swallowed', async () => {
    const failing = classifier('remote', async () => { throw new Error('529 overloaded'); });
    const r = await shadowStage1(
      { ...base(failing, []), append: () => { throw new Error('ENOSPC'); } },
      mem('a', [], null, 'a'),
      mem('b', [], null, 'b'),
      primary,
    );
    expect(r.error).toBe('529 overloaded');
  });
});
