import { describe, it, expect, vi } from 'vitest';
import { stage1HaikuFilter, parseStage1Response } from '../../src/edges/stage1-haiku.js';
import { resolveModelTier } from '../../src/model-tier.js';
import type { LLMProvider } from '../../src/providers/types.js';

function makeMockProvider(response: string, cost_usd: number): LLMProvider {
  return {
    name: 'anthropic',
    concurrencyLimit: 10,
    complete: vi.fn().mockResolvedValue({
      response,
      cost_usd,
      latency_ms: 100,
      input_tokens: 200,
      output_tokens: 30,
    }),
  };
}

describe('parseStage1Response', () => {
  it('parses YES + comment', () => {
    expect(parseStage1Response('YES — they conflict on library choice')).toEqual({ pass: true, comment: 'they conflict on library choice' });
  });
  it('parses NO + comment', () => {
    expect(parseStage1Response('NO — unrelated topics')).toEqual({ pass: false, comment: 'unrelated topics' });
  });
  it('case-insensitive verdict', () => {
    expect(parseStage1Response('yes')).toEqual({ pass: true, comment: '' });
  });
  it('throws on unparseable response', () => {
    expect(() => parseStage1Response('maybe?')).toThrow();
  });
});

describe('stage1HaikuFilter', () => {
  it('returns pass=true when Haiku says YES', async () => {
    const provider = makeMockProvider('YES — both discuss library X', 0.00028);
    const result = await stage1HaikuFilter(provider, {
      from: { id: 'a', content: 'use library X' },
      to:   { id: 'b', content: 'do not use library X' },
    });
    expect(result.pass).toBe(true);
    expect(result.cost_usd).toBeCloseTo(0.00028, 6);
    expect(provider.complete).toHaveBeenCalledWith(
      // claw-x1mg: stage 1's tier is now env-resolved and no longer haiku by
      // default. Asserting on the resolver keeps this test honest if the
      // shipped default changes again, instead of re-pinning a literal.
      expect.objectContaining({
        model: resolveModelTier('classify-edges-stage1'),
        system: expect.stringContaining('relation'),
        prompt: expect.stringContaining('use library X'),
        max_tokens: expect.any(Number),
      }),
    );
  });

  it('returns pass=false when Haiku says NO', async () => {
    const provider = makeMockProvider('NO — distinct subsystems', 0.00024);
    const result = await stage1HaikuFilter(provider, {
      from: { id: 'a', content: 'morning brief' },
      to:   { id: 'b', content: 'email triage' },
    });
    expect(result.pass).toBe(false);
  });
});
