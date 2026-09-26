import { describe, expect, it, vi } from 'vitest';
import { OpenJevClassifier } from '../../src/classifiers/openjev.js';

function resultResponse(): Response {
  return new Response(
    JSON.stringify({
      model: 'openjev-test',
      usage: { input_tokens: 20, output_tokens: 0 },
      answers: { category: { type: 'choice', choice: 'a', confidence: 0.7, probabilities: { a: 0.7, b: 0.3 } } },
    }),
    { status: 200, headers: { 'content-type': 'application/json' } },
  );
}

describe('OpenJevClassifier', () => {
  it('uses the loopback default with a placeholder credential and zero cost', async () => {
    let authorization = '';
    const fetchFn = vi.fn(async (_url: string, init?: RequestInit) => {
      authorization = new Headers(init?.headers).get('authorization') ?? '';
      return resultResponse();
    });
    const classifier = new OpenJevClassifier({ env: {}, fetchFn });
    const result = await classifier.classify({
      state: 'Local fixture text',
      questions: {
        category: { type: 'choice', instructions: 'Choose.', labels: { a: null, b: null } },
      },
    });

    expect(fetchFn.mock.calls[0][0]).toBe('http://127.0.0.1:8765/v1/systemone');
    expect(authorization).toBe('Bearer openjev-local');
    expect(result.cost_usd).toBe(0);
    expect(classifier.egress).toBe('local');
  });

  it('prefers an explicit URL over R2MCP_OPENJEV_URL', async () => {
    const fetchFn = vi.fn(async () => resultResponse());
    const classifier = new OpenJevClassifier({
      baseURL: 'http://explicit.test:9000/',
      env: { R2MCP_OPENJEV_URL: 'http://env.test:9001' },
      fetchFn,
    });
    await classifier.classify({
      state: 'Local fixture text',
      questions: {
        category: { type: 'choice', instructions: 'Choose.', labels: { a: null, b: null } },
      },
    });
    expect(fetchFn.mock.calls[0][0]).toBe('http://explicit.test:9000/v1/systemone');
  });
});
