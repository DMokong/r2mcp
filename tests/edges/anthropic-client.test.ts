import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EdgeAnthropicClient, type CompletionResult } from '../../src/edges/anthropic-client.js';

describe('EdgeAnthropicClient', () => {
  beforeEach(() => { vi.restoreAllMocks(); });

  it('throws if ANTHROPIC_API_KEY is missing', () => {
    const oldKey = process.env.ANTHROPIC_API_KEY;
    delete process.env.ANTHROPIC_API_KEY;
    try {
      expect(() => new EdgeAnthropicClient()).toThrow(/ANTHROPIC_API_KEY/);
    } finally {
      if (oldKey) process.env.ANTHROPIC_API_KEY = oldKey;
    }
  });

  it('computes Haiku cost from token counts', () => {
    process.env.ANTHROPIC_API_KEY = 'sk-test';
    const c = new EdgeAnthropicClient();
    // Haiku: input $0.80/MTok, output $4.00/MTok
    // 1000 in + 500 out = 0.0008 + 0.002 = 0.0028
    expect(c.priceForTokens('haiku', 1000, 500)).toBeCloseTo(0.0028, 6);
  });

  it('computes Opus cost from token counts', () => {
    process.env.ANTHROPIC_API_KEY = 'sk-test';
    const c = new EdgeAnthropicClient();
    // Opus: input $15/MTok, output $75/MTok
    // 1000 in + 500 out = 0.015 + 0.0375 = 0.0525
    expect(c.priceForTokens('opus', 1000, 500)).toBeCloseTo(0.0525, 6);
  });

  it('estimateMessageCost gives a stable upper-bound estimate', () => {
    process.env.ANTHROPIC_API_KEY = 'sk-test';
    const c = new EdgeAnthropicClient();
    const haiku = c.estimateMessageCost('haiku', 'short input', 200);
    const opus = c.estimateMessageCost('opus', 'short input', 200);
    expect(haiku).toBeGreaterThan(0);
    expect(opus).toBeGreaterThan(haiku);
  });

  it('complete() uses the SDK and returns text + cost', async () => {
    process.env.ANTHROPIC_API_KEY = 'sk-test';
    const c = new EdgeAnthropicClient();
    // Mock the SDK call
    const mockCreate = vi.fn().mockResolvedValue({
      content: [{ type: 'text', text: 'test response' }],
      usage: { input_tokens: 100, output_tokens: 50 },
    });
    (c as unknown as { sdk: { messages: { create: typeof mockCreate } } }).sdk = {
      messages: { create: mockCreate },
    };
    const result: CompletionResult = await c.complete('haiku', 'system', 'user', 256);
    expect(result.text).toBe('test response');
    expect(result.input_tokens).toBe(100);
    expect(result.output_tokens).toBe(50);
    expect(result.cost_usd).toBeCloseTo(c.priceForTokens('haiku', 100, 50), 6);
    expect(mockCreate).toHaveBeenCalledOnce();
  });
});
