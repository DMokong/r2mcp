import { describe, expect, it, vi } from 'vitest';
import {
  LLMEnumClassifier,
  LLMEnumResponseError,
  parseAnswers,
} from '../../src/classifiers/llm-enum.js';
import type { CompleteResponse, LLMProvider } from '../../src/providers/types.js';

function fakeProvider(responses: CompleteResponse[]): LLMProvider {
  return {
    name: 'anthropic',
    concurrencyLimit: 7,
    complete: vi.fn(async () => {
      const response = responses.shift();
      if (!response) throw new Error('No fake response queued.');
      return response;
    }),
  };
}

const questions = {
  relevant: { type: 'noul' as const, instructions: 'Is this relevant?' },
  topic: {
    type: 'choice' as const,
    instructions: 'Pick one.',
    labels: { code: null, docs: null },
  },
  impact: {
    type: 'score' as const,
    instructions: 'Rate it.',
    levels: ['low', 'medium', 'high'],
  },
};

describe('LLMEnumClassifier', () => {
  it('normalizes distributions and derives choice, confidence, and expected score', async () => {
    const provider = fakeProvider([
      {
        response: JSON.stringify({
          answers: {
            relevant: { probabilities: { yes: 0.8 } },
            topic: { probabilities: { code: 3, docs: 1 } },
            impact: { probabilities: { 0: 1, 1: 2, 2: 1 } },
          },
        }),
        cost_usd: 0.012,
        latency_ms: 42,
        input_tokens: 150,
        output_tokens: 30,
        raw: { id: 'fake' },
      },
    ]);
    const classifier = new LLMEnumClassifier(provider, { model: 'sonnet' });
    const result = await classifier.classify({ state: 'Public fixture text', questions });

    expect(classifier.concurrencyLimit).toBe(7);
    expect(result.answers.relevant).toEqual({ type: 'noul', noul: 0.8 });
    expect(result.answers.topic).toEqual({
      type: 'choice',
      choice: 'code',
      confidence: 0.75,
      probabilities: { code: 0.75, docs: 0.25 },
    });
    expect(result.answers.impact).toEqual({
      type: 'score',
      score: 1,
      confidence: 0.5,
      probabilities: { 0: 0.25, 1: 0.5, 2: 0.25 },
    });
    expect(result).toMatchObject({
      model: 'sonnet',
      cost_usd: 0.012,
      latency_ms: 42,
      input_tokens: 150,
      raw: { id: 'fake' },
    });
  });

  it('retries malformed output once and includes both attempts in accounting', async () => {
    const provider = fakeProvider([
      { response: 'not JSON', cost_usd: 0.01, latency_ms: 10, input_tokens: 5 },
      {
        response: JSON.stringify({
          answers: {
            relevant: 0.25,
            topic: { code: 1, docs: 1 },
            impact: { 0: 2, 1: 1, 2: 1 },
          },
        }),
        cost_usd: 0.02,
        latency_ms: 20,
        input_tokens: 7,
      },
    ]);
    const classifier = new LLMEnumClassifier(provider, { model: 'opus' });
    const result = await classifier.classify({ state: 'Public fixture text', questions });

    expect(provider.complete).toHaveBeenCalledTimes(2);
    expect(result.cost_usd).toBeCloseTo(0.03);
    expect(result.latency_ms).toBe(30);
    expect(result.input_tokens).toBe(12);
  });

  it('throws a typed error after exactly two malformed responses', async () => {
    const provider = fakeProvider([
      { response: '{}', cost_usd: 0, latency_ms: 1 },
      { response: '{', cost_usd: 0, latency_ms: 1 },
    ]);
    const classifier = new LLMEnumClassifier(provider, { model: 'sonnet' });
    const promise = classifier.classify({ state: 'Public fixture text', questions });
    await expect(promise).rejects.toBeInstanceOf(LLMEnumResponseError);
    expect(provider.complete).toHaveBeenCalledTimes(2);
  });

  it('resolves the classify-enum model tier at call time', async () => {
    vi.stubEnv('R2MCP_CLASSIFY_ENUM_MODEL', 'opus');
    try {
      const provider = fakeProvider([
        { response: '{"answer":0.6}', cost_usd: 0, latency_ms: 1 },
      ]);
      const classifier = new LLMEnumClassifier(provider);
      await classifier.classify({
        state: 'Public fixture text',
        questions: { answer: { type: 'noul', instructions: 'Check it.' } },
      });
      expect(provider.complete).toHaveBeenCalledWith(expect.objectContaining({ model: 'opus' }));
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it('rejects invalid enumerations before calling the remote LLM', async () => {
    const provider = fakeProvider([]);
    const classifier = new LLMEnumClassifier(provider, { model: 'sonnet' });
    await expect(
      classifier.classify({
        state: 'Public fixture text',
        questions: { bad: { type: 'score', instructions: 'Rate it.', levels: ['only'] } },
      }),
    ).rejects.toThrow(/at least two levels/);
    expect(provider.complete).not.toHaveBeenCalled();
  });
});

describe('parseAnswers', () => {
  it('accepts a fenced JSON repair and normalizes yes/no noul probabilities', () => {
    const answer = parseAnswers(
      '```json\n{"q":{"probabilities":{"yes":3,"no":1}}}\n```',
      { q: { type: 'noul', instructions: 'Check.' } },
    );
    expect(answer.q).toEqual({ type: 'noul', noul: 0.75 });
  });

  it('rejects negative and missing probabilities', () => {
    expect(() =>
      parseAnswers('{"q":{"a":1,"b":-1}}', {
        q: { type: 'choice', instructions: 'Pick.', labels: { a: null, b: null } },
      }),
    ).toThrow(/finite non-negative/);
    expect(() =>
      parseAnswers('{"q":{"a":1}}', {
        q: { type: 'choice', instructions: 'Pick.', labels: { a: null, b: null } },
      }),
    ).toThrow(/probability "b"/);
  });
});
