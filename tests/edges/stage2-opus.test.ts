import { describe, it, expect, vi } from 'vitest';
import {
  stage2OpusClassify,
  parseStage2Response,
  isRejectionPair,
} from '../../src/edges/stage2-opus.js';
import type { LLMProvider } from '../../src/providers/types.js';

function makeMockProvider(response: string, cost_usd: number): LLMProvider {
  return {
    name: 'anthropic',
    concurrencyLimit: 10,
    complete: vi.fn().mockResolvedValue({
      response,
      cost_usd,
      latency_ms: 100,
      input_tokens: 800,
      output_tokens: 60,
    }),
  };
}

describe('isRejectionPair (AC10)', () => {
  it('detects pairs where either memory is type=rejection', () => {
    expect(isRejectionPair({ type: 'rejection' }, { type: 'context' })).toBe(true);
    expect(isRejectionPair({ type: 'context' }, { type: 'rejection' })).toBe(true);
  });
  it('detects pairs where both are rejection', () => {
    expect(isRejectionPair({ type: 'rejection' }, { type: 'rejection' })).toBe(true);
  });
  it('returns false for plain context pairs', () => {
    expect(isRejectionPair({ type: 'context' }, { type: 'context' })).toBe(false);
  });
});

describe('parseStage2Response', () => {
  it('parses a valid JSON object', () => {
    const text = '{"relation": "contradicts", "confidence": 0.84, "rationale": "B deprecates A"}';
    expect(parseStage2Response(text)).toEqual({
      relation: 'contradicts', confidence: 0.84, rationale: 'B deprecates A',
    });
  });
  it('extracts JSON from markdown code fence', () => {
    const text = '```json\n{"relation": "supports", "confidence": 0.7, "rationale": "ok"}\n```';
    expect(parseStage2Response(text).relation).toBe('supports');
  });
  it('parses a NONE verdict', () => {
    const text = '{"relation": "none", "confidence": 0, "rationale": "no relation found"}';
    expect(parseStage2Response(text).relation).toBe('none');
  });
  it('throws on invalid JSON', () => {
    expect(() => parseStage2Response('not json')).toThrow();
  });
  it('throws on bogus relation', () => {
    expect(() => parseStage2Response('{"relation": "bogus", "confidence": 0.5, "rationale": "x"}')).toThrow();
  });
});

describe('stage2OpusClassify (R4)', () => {
  it('returns the parsed relation when Opus answers cleanly', async () => {
    const provider = makeMockProvider(
      '{"relation":"contradicts","confidence":0.85,"rationale":"explicit deprecation"}',
      0.0165,
    );
    const result = await stage2OpusClassify(provider, {
      from: { id: 'a', content: 'use library X', type: 'context' },
      to:   { id: 'b', content: 'do not use X — deprecated', type: 'context' },
    });
    expect(result.kind).toBe('classified');
    if (result.kind !== 'classified') return;
    expect(result.relation).toBe('contradicts');
    expect(result.confidence).toBe(0.85);
    expect(result.cost_usd).toBeCloseTo(0.0165, 6);
  });

  it('classifies rejection pairs via the LLM and returns non-contradicts relations (AC10)', async () => {
    // brew-deps fixture pattern: a rejection and a preference saying the same
    // thing in opposite framing. The LLM should recognize them as related_to or evolved_into.
    const provider = makeMockProvider(
      '{"relation":"related_to","confidence":0.78,"rationale":"both about brew deps tree check"}',
      0.014,
    );
    const result = await stage2OpusClassify(provider, {
      from: { id: 'r1', content: 'do NOT install brew formulae without checking deps', type: 'rejection' },
      to:   { id: 'p1', content: 'always run brew deps --tree before installing', type: 'preference' },
    });
    expect(result.kind).toBe('classified');
    if (result.kind !== 'classified') return;
    expect(result.relation).toBe('related_to');
    expect(result.confidence).toBe(0.78);
    expect(provider.complete).toHaveBeenCalledOnce();
  });

  it('downgrades contradicts → none when the LLM violates the rejection-pair rule (AC10 guard)', async () => {
    const provider = makeMockProvider(
      '{"relation":"contradicts","confidence":0.85,"rationale":"prompt-violation: A and B disagree"}',
      0.014,
    );
    const result = await stage2OpusClassify(provider, {
      from: { id: 'r1', content: 'do not commit secrets', type: 'rejection' },
      to:   { id: 'c1', content: 'we commit dev tokens for testing', type: 'context' },
    });
    expect(result.kind).toBe('classified');
    if (result.kind !== 'classified') return;
    expect(result.relation).toBe('none');
    expect(result.downgraded).toBe(true);
    expect(result.rationale).toMatch(/AC10.*downgraded/);
  });

  it('returns none when Opus says no relation', async () => {
    const provider = makeMockProvider(
      '{"relation":"none","confidence":0,"rationale":"distinct"}',
      0.014,
    );
    const result = await stage2OpusClassify(provider, {
      from: { id: 'a', content: 'morning brief', type: 'context' },
      to:   { id: 'b', content: 'email triage', type: 'context' },
    });
    expect(result.kind).toBe('classified');
    if (result.kind !== 'classified') return;
    expect(result.relation).toBe('none');
  });
});
