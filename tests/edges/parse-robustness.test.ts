/**
 * trk-6qd regressions — reply shapes captured from the trk-7mx live eval that
 * previously dropped the pair.
 */
import { describe, expect, it, vi } from 'vitest';
import { parseStage1Response, stage1HaikuFilter } from '../../src/edges/stage1-haiku.js';
import { parseStage2Response, stage2OpusClassify } from '../../src/edges/stage2-opus.js';
import type { LLMProvider } from '../../src/providers/types.js';

function provider(responses: string[]): LLMProvider {
  const complete = vi.fn();
  for (const response of responses) {
    complete.mockResolvedValueOnce({ response, cost_usd: 0.01, latency_ms: 1 });
  }
  return { name: 'anthropic', concurrencyLimit: 1, complete };
}

const pair = {
  from: { id: 'a', content: 'A', type: 'context' },
  to: { id: 'b', content: 'B', type: 'context' },
};

describe('parseStage1Response (trk-6qd)', () => {
  it('accepts a verdict whose reason spans several lines', () => {
    expect(
      parseStage1Response('NO — Both describe the same routing decision\n(single file vs per-domain files)\nas mutually exclusive'),
    ).toEqual({ pass: false, comment: 'Both describe the same routing decision (single file vs per-domain files) as mutually exclusive' });
  });
  it('accepts bold and an "Answer:" prefix', () => {
    expect(parseStage1Response('**YES** — same subject').pass).toBe(true);
    expect(parseStage1Response('Answer: NO. unrelated').pass).toBe(false);
  });
  it('does not mistake a word that merely starts with yes/no', () => {
    expect(() => parseStage1Response('Nothing in common')).toThrow(/not parseable/);
  });
});

describe('parseStage2Response (trk-6qd)', () => {
  it('salvages relation and confidence from a reply cut mid-rationale', () => {
    const cut = '{"relation": "supersedes", "confidence": 0.9, "rationale": "B (newer, marked \'no';
    expect(parseStage2Response(cut)).toEqual({
      relation: 'supersedes',
      confidence: 0.9,
      rationale: "B (newer, marked 'no [truncated]",
    });
  });
  it('still rejects a reply with no usable fields', () => {
    expect(() => parseStage2Response('')).toThrow(/not JSON/);
    expect(() => parseStage2Response('{"relation": "supp')).toThrow(/not JSON/);
  });
});

describe('one retry on an unparseable reply (trk-6qd)', () => {
  it('Stage 1 retries once and counts both attempts', async () => {
    const p = provider(['', 'YES — overlap']);
    const r = await stage1HaikuFilter(p, pair);
    expect(r).toEqual({ pass: true, comment: 'overlap', cost_usd: 0.02 });
    expect(p.complete).toHaveBeenCalledTimes(2);
  });
  it('Stage 2 retries once, then gives up with the parse error', async () => {
    const p = provider(['', '']);
    await expect(stage2OpusClassify(p, pair)).rejects.toThrow(/not JSON/);
    expect(p.complete).toHaveBeenCalledTimes(2);
  });
  it('Stage 2 does not retry a reply it can use', async () => {
    const p = provider(['{"relation":"supports","confidence":0.8,"rationale":"same"}']);
    const r = await stage2OpusClassify(p, pair);
    expect(r.relation).toBe('supports');
    expect(p.complete).toHaveBeenCalledTimes(1);
  });
});
