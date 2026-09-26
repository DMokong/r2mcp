/**
 * Deterministic fake ClassifierProvider for tests and spend-free CLI runs
 * (trk-7mx.1). Exercises the full eval-classifiers pipeline — noul + choice
 * questions, egress metadata — without any network call or API cost.
 */

import type {
  ClassifierAnswer,
  ClassifierProvider,
  ClassifyRequest,
  ClassifyResponse,
} from '../types.js';

export interface FakeClassifierProviderOptions {
  name?: ClassifierProvider['name'];
  egress?: ClassifierProvider['egress'];
  /** Returns P(yes) for a noul question. Defaults to a constant 0.5. */
  noulAnswer?: (req: ClassifyRequest) => number;
  /** Returns a probability distribution over the question's labels. */
  choiceAnswer?: (req: ClassifyRequest, labels: string[]) => Record<string, number>;
  latencyMs?: number;
}

function uniform(labels: string[]): Record<string, number> {
  const p = 1 / labels.length;
  return Object.fromEntries(labels.map((l) => [l, p]));
}

export function createFakeClassifierProvider(
  opts: FakeClassifierProviderOptions = {},
): ClassifierProvider {
  const name = opts.name ?? 'openjev';
  const egress = opts.egress ?? 'local';

  return {
    name,
    egress,
    concurrencyLimit: 4,
    async classify(req: ClassifyRequest): Promise<ClassifyResponse> {
      const answers: Record<string, ClassifierAnswer> = {};
      for (const [key, question] of Object.entries(req.questions)) {
        if (question.type === 'noul') {
          const noul = opts.noulAnswer ? opts.noulAnswer(req) : 0.5;
          answers[key] = { type: 'noul', noul };
        } else if (question.type === 'choice') {
          const labels = Object.keys(question.labels);
          const probabilities = opts.choiceAnswer ? opts.choiceAnswer(req, labels) : uniform(labels);
          const choice = Object.entries(probabilities).sort((a, b) => b[1] - a[1])[0]?.[0] ?? labels[0];
          answers[key] = {
            type: 'choice',
            choice,
            confidence: probabilities[choice] ?? 0,
            probabilities,
          };
        } else if (question.type === 'score') {
          throw new Error('FakeClassifierProvider: score questions are not used by trk-7mx.1');
        } else {
          throw new Error(`FakeClassifierProvider: unsupported question type ${(question as { type: string }).type}`);
        }
      }
      return {
        answers,
        model: 'fake-deterministic',
        cost_usd: 0,
        latency_ms: opts.latencyMs ?? 1,
      };
    },
  };
}
