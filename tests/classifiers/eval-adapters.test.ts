import { describe, it, expect } from 'vitest';
import { classifyStage1AsNoul, classifyStage2AsChoice } from '../../src/classifiers/eval/adapters.js';
import { createFakeClassifierProvider } from '../../src/classifiers/eval/fake-provider.js';
import { STAGE2_RELATIONS } from '../../src/edges/stage2-opus.js';

const pair = {
  from: { id: 'f1', content: 'Postgres is the default datastore.', type: 'context' },
  to: { id: 't1', content: 'New services use Postgres.', type: 'context' },
};

describe('classifyStage1AsNoul', () => {
  it('passes when probability meets the threshold', async () => {
    const provider = createFakeClassifierProvider({ noulAnswer: () => 0.8 });
    const result = await classifyStage1AsNoul(provider, pair, 0.5);
    expect(result.pass).toBe(true);
    expect(result.probability).toBe(0.8);
  });

  it('fails below the threshold', async () => {
    const provider = createFakeClassifierProvider({ noulAnswer: () => 0.3 });
    const result = await classifyStage1AsNoul(provider, pair, 0.5);
    expect(result.pass).toBe(false);
  });
});

describe('classifyStage2AsChoice', () => {
  it('offers every STAGE2_RELATIONS label to the provider', async () => {
    let seenLabels: string[] = [];
    const provider = createFakeClassifierProvider({
      choiceAnswer: (_req, labels) => {
        seenLabels = labels;
        return Object.fromEntries(labels.map((l) => [l, l === 'supports' ? 1 : 0]));
      },
    });
    const result = await classifyStage2AsChoice(provider, pair);
    expect(seenLabels.sort()).toEqual([...STAGE2_RELATIONS].sort());
    expect(result.relation).toBe('supports');
    expect(result.confidence).toBe(1);
  });

  it('surfaces the full probability distribution', async () => {
    const provider = createFakeClassifierProvider({
      choiceAnswer: (_req, labels) => {
        const probs = Object.fromEntries(labels.map((l) => [l, 0]));
        probs.related_to = 0.6;
        probs.supports = 0.4;
        return probs;
      },
    });
    const result = await classifyStage2AsChoice(provider, pair);
    expect(result.relation).toBe('related_to');
    expect(result.probabilities.supports).toBe(0.4);
  });
});
