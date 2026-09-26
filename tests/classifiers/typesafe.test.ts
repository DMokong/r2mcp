import { describe, expect, it, vi } from 'vitest';
import { TypeSafeClassifier } from '../../src/classifiers/typesafe.js';

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}

describe('TypeSafeClassifier', () => {
  it('requires a hosted Jev API key', () => {
    expect(() => new TypeSafeClassifier({ env: {} })).toThrow(/JEV_API_KEY.*TYPESAFE_API_KEY/);
  });

  it('uses JEV_API_KEY before TYPESAFE_API_KEY and prices input tokens only', async () => {
    let authorization = '';
    const fetchFn = vi.fn(async (_url: string, init?: RequestInit) => {
      authorization = new Headers(init?.headers).get('authorization') ?? '';
      return jsonResponse({
        model: 'jev-latest',
        usage: { input_tokens: 2_000_000, output_tokens: 40 },
        answers: { safe: { type: 'noul', noul: 0.9 } },
      });
    });
    const classifier = new TypeSafeClassifier({
      env: { JEV_API_KEY: 'jev-key', TYPESAFE_API_KEY: 'typesafe-key' },
      fetchFn,
    });

    const result = await classifier.classify({
      state: 'Public fixture text',
      questions: { safe: { type: 'noul', instructions: 'Is it safe?' } },
    });

    expect(authorization).toBe('Bearer jev-key');
    expect(result.answers.safe).toEqual({ type: 'noul', noul: 0.9 });
    expect(result.cost_usd).toBe(0.084);
    expect(result.input_tokens).toBe(2_000_000);
    expect(result.latency_ms).toBeGreaterThanOrEqual(0);
    expect(classifier.egress).toBe('remote');
  });

  it('honors TYPESAFE_BASE_URL from the supplied environment', async () => {
    const fetchFn = vi.fn(async () =>
      jsonResponse({
        model: 'jev-test',
        usage: { input_tokens: 1, output_tokens: 0 },
        answers: { check: { type: 'noul', noul: 0.2 } },
      }),
    );
    const classifier = new TypeSafeClassifier({
      env: { TYPESAFE_API_KEY: 'test-key', TYPESAFE_BASE_URL: 'https://jev.example.test/root/' },
      fetchFn,
    });
    await classifier.classify({
      state: 'Public fixture text',
      questions: { check: { type: 'noul', instructions: 'Check it.' } },
    });
    expect(fetchFn.mock.calls[0][0]).toBe('https://jev.example.test/root/v1/systemone');
  });
});
