import { describe, expect, it } from 'vitest';
import { fromSystemOneResult, toSystemOneRequest } from '../../src/classifiers/system-one.js';

describe('System One wire adapter', () => {
  it('maps every classifier question to SDK criteria', () => {
    const result = toSystemOneRequest({
      state: { title: 'Public release note' },
      model: 'jev-test',
      questions: {
        relevant: { type: 'noul', instructions: 'Is it relevant?' },
        topic: {
          type: 'choice',
          instructions: 'Pick a topic.',
          labels: { sdk: 'SDK change', docs: null },
        },
        impact: {
          type: 'score',
          instructions: 'Rate impact.',
          levels: ['none', null, 'high'],
        },
      },
    });

    expect(result).toEqual({
      state: { title: 'Public release note' },
      model: 'jev-test',
      questions: {
        relevant: { type: 'noul', instructions: 'Is it relevant?', criteria: undefined },
        topic: {
          type: 'choice',
          instructions: 'Pick a topic.',
          criteria: { sdk: 'SDK change', docs: null },
        },
        impact: {
          type: 'score',
          instructions: 'Rate impact.',
          criteria: ['none', null, 'high'],
        },
      },
    });
  });

  it('removes the SDK-only score legend from responses', () => {
    const raw = {
      model: 'jev-test',
      usage: { input_tokens: 250, output_tokens: 0 },
      answers: {
        relevant: { type: 'noul' as const, noul: 0.75 },
        topic: {
          type: 'choice' as const,
          choice: 'sdk',
          confidence: 0.6,
          probabilities: { sdk: 0.6, docs: 0.4 },
        },
        impact: {
          type: 'score' as const,
          score: 1.5,
          confidence: 0.5,
          legend: { 0: 'none', 1: null, 2: 'high' },
          probabilities: { 0: 0.1, 1: 0.3, 2: 0.6 },
        },
      },
    };

    expect(fromSystemOneResult(raw, { latencyMs: 12, costUsd: 0.02 })).toEqual({
      model: 'jev-test',
      cost_usd: 0.02,
      latency_ms: 12,
      input_tokens: 250,
      raw,
      answers: {
        relevant: { type: 'noul', noul: 0.75 },
        topic: {
          type: 'choice',
          choice: 'sdk',
          confidence: 0.6,
          probabilities: { sdk: 0.6, docs: 0.4 },
        },
        impact: {
          type: 'score',
          score: 1.5,
          confidence: 0.5,
          probabilities: { 0: 0.1, 1: 0.3, 2: 0.6 },
        },
      },
    });
  });

  it('rejects a score rubric with fewer than two levels before egress', () => {
    expect(() =>
      toSystemOneRequest({
        state: 'public text',
        questions: { score: { type: 'score', instructions: 'Score it.', levels: ['only'] } },
      }),
    ).toThrow(/at least two levels/);
  });
});
