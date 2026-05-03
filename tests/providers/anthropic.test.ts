import { describe, it, expect, vi } from 'vitest';
import Anthropic from '@anthropic-ai/sdk';
import { AnthropicProvider } from '../../src/providers/anthropic.js';

describe('AnthropicProvider', () => {
  it('throws if no apiKey is provided and ANTHROPIC_API_KEY is unset', () => {
    const old = process.env.ANTHROPIC_API_KEY;
    delete process.env.ANTHROPIC_API_KEY;
    try {
      expect(() => new AnthropicProvider()).toThrow(/ANTHROPIC_API_KEY/);
    } finally {
      if (old) process.env.ANTHROPIC_API_KEY = old;
    }
  });

  it('reports its name and concurrency limit', () => {
    const p = new AnthropicProvider({ apiKey: 'sk-test' });
    expect(p.name).toBe('anthropic');
    expect(p.concurrencyLimit).toBe(10);
  });

  it('computes Haiku cost from token counts (matches list price)', () => {
    // Haiku: input $0.80/MTok, output $4.00/MTok
    // 1000 in + 500 out = 0.0008 + 0.002 = 0.0028
    expect(AnthropicProvider.priceForTokens('haiku', 1000, 500)).toBeCloseTo(0.0028, 6);
  });

  it('computes Opus cost from token counts (matches list price)', () => {
    // Opus: input $15/MTok, output $75/MTok
    expect(AnthropicProvider.priceForTokens('opus', 1000, 500)).toBeCloseTo(0.0525, 6);
  });

  it('complete() calls the SDK and reports cost_usd > 0 (D.AC5 contrast)', async () => {
    const sdk = {
      messages: {
        create: vi.fn().mockResolvedValue({
          content: [{ type: 'text', text: 'hello' }],
          usage: { input_tokens: 100, output_tokens: 50 },
        }),
      },
    } as unknown as Anthropic;
    const p = new AnthropicProvider({ sdk });
    const out = await p.complete({ model: 'haiku', prompt: 'hi', max_tokens: 50 });
    expect(out.response).toBe('hello');
    expect(out.input_tokens).toBe(100);
    expect(out.output_tokens).toBe(50);
    expect(out.cost_usd).toBeGreaterThan(0);
    expect(out.cost_usd).toBeCloseTo(AnthropicProvider.priceForTokens('haiku', 100, 50), 6);
  });
});
