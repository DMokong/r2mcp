import {
  choice,
  noul,
  score,
  type EntryType,
  type Questions,
  type ScoreCriteria,
  type SystemOneRequest,
  type SystemOneResult,
} from '@typesafe-ai/sdk';
import type {
  ClassifierAnswer,
  ClassifierQuestion,
  ClassifyRequest,
  ClassifyResponse,
} from './types.js';

/** Convert the public classifier contract to the TypeSafe System One wire shape. */
export function toSystemOneRequest(request: ClassifyRequest): SystemOneRequest<Questions> {
  const questions: Questions = {};
  for (const [name, question] of Object.entries(request.questions)) {
    questions[name] = toSystemOneQuestion(question);
  }

  return {
    // ClassifyRequest intentionally permits Record<string, unknown>, while the
    // SDK describes the JSON-compatible subset accepted by the wire endpoint.
    state: request.state as EntryType,
    questions,
    ...(request.model === undefined ? {} : { model: request.model }),
  };
}

function toSystemOneQuestion(question: ClassifierQuestion): Questions[string] {
  switch (question.type) {
    case 'noul':
      return noul(question.instructions);
    case 'choice':
      return choice(question.instructions, question.labels);
    case 'score':
      if (question.levels.length < 2) {
        throw new Error('A score classifier question requires at least two levels.');
      }
      return score(question.instructions, question.levels as ScoreCriteria);
  }
}

export interface SystemOneResponseMetadata {
  latencyMs: number;
  costUsd: number;
  raw?: unknown;
}

/** Convert an SDK response back to the backend-independent classifier contract. */
export function fromSystemOneResult(
  result: SystemOneResult<Questions>,
  metadata: SystemOneResponseMetadata,
): ClassifyResponse {
  const answers: Record<string, ClassifierAnswer> = {};

  for (const [name, answer] of Object.entries(result.answers)) {
    switch (answer.type) {
      case 'noul':
        answers[name] = { type: 'noul', noul: answer.noul };
        break;
      case 'choice':
        answers[name] = {
          type: 'choice',
          choice: answer.choice,
          confidence: answer.confidence,
          probabilities: { ...answer.probabilities },
        };
        break;
      case 'score':
        answers[name] = {
          type: 'score',
          score: answer.score,
          confidence: answer.confidence,
          probabilities: { ...answer.probabilities },
        };
        break;
    }
  }

  return {
    answers,
    model: result.model,
    cost_usd: metadata.costUsd,
    latency_ms: metadata.latencyMs,
    input_tokens: result.usage.input_tokens,
    raw: metadata.raw ?? result,
  };
}
