import { describe, it, expect, vi } from 'vitest';
import { OpenRouterProvider } from '../../src/providers/openrouter.js';

describe('OpenRouterProvider', () => {
  it('throws when no API key is configured', () => {
    const old = process.env.R2MCP_OPENROUTER_API_KEY;
    delete process.env.R2MCP_OPENROUTER_API_KEY;
    try {
      expect(() => new OpenRouterProvider()).toThrow(/R2MCP_OPENROUTER_API_KEY/);
    } finally {
      if (old) process.env.R2MCP_OPENROUTER_API_KEY = old;
    }
  });

  it('reports name and concurrencyLimit=10 (D.R6)', () => {
    const p = new OpenRouterProvider({ apiKey: 'sk-or-test', fetchFn: vi.fn() });
    expect(p.name).toBe('openrouter');
    expect(p.concurrencyLimit).toBe(10);
  });

  it('complete() reports cost_usd > 0 from token usage (D.AC3)', async () => {
    const fetchFn = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: 'YES — same library' } }],
        usage: { prompt_tokens: 800, completion_tokens: 60 },
      }),
    } as Response);
    const p = new OpenRouterProvider({ apiKey: 'sk-or-test', fetchFn });
    const result = await p.complete({ model: 'haiku', prompt: 'hi', system: 'sys' });
    expect(result.response).toBe('YES — same library');
    expect(result.cost_usd).toBeGreaterThan(0);
    expect(result.cost_usd).toBeCloseTo(OpenRouterProvider.priceForTokens('haiku', 800, 60), 6);
    expect(result.input_tokens).toBe(800);
    expect(result.output_tokens).toBe(60);
  });

  it('throws on non-OK HTTP response', async () => {
    const fetchFn = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      text: async () => 'invalid api key',
    } as Response);
    const p = new OpenRouterProvider({ apiKey: 'bad', fetchFn });
    await expect(p.complete({ model: 'haiku', prompt: 'hi' })).rejects.toThrow(/401/);
  });

  it('sends system as a separate role when provided', async () => {
    let captured: { messages?: Array<{ role: string; content: string }> } = {};
    const fetchFn = vi.fn().mockImplementation(async (_url: string, init: RequestInit) => {
      captured = JSON.parse(init.body as string);
      return {
        ok: true,
        json: async () => ({
          choices: [{ message: { content: 'NO' } }],
          usage: { prompt_tokens: 50, completion_tokens: 5 },
        }),
      } as Response;
    });
    const p = new OpenRouterProvider({ apiKey: 'sk-or-test', fetchFn });
    await p.complete({ model: 'haiku', prompt: 'q', system: 's' });
    expect(captured.messages?.[0]).toEqual({ role: 'system', content: 's' });
    expect(captured.messages?.[1]).toEqual({ role: 'user', content: 'q' });
  });
});
