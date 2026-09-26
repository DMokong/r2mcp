/**
 * ClassifierProvider — the "third primitive" (trk-7mx): bounded question +
 * enumerated answers + probabilities, never prose. Deliberately separate from
 * LLMProvider.complete(): a classifier returns a distribution, not text, and
 * widening complete() would push parse-the-string back into every call site.
 *
 * The request/answer shapes mirror TypeSafe's System One wire API
 * (POST /v1/systemone, @typesafe-ai/sdk) so backends swap freely:
 *   - 'openjev'  — local OpenJev server speaking the same wire API (zero egress)
 *   - 'typesafe' — hosted Jev (remote egress; public-content scopes ONLY)
 *   - 'llm-enum' — an existing LLMProvider forced to pick from the enum (baseline)
 *
 * Probabilities are for ranking, not truth: hosted Jev is measurably
 * overconfident out of distribution, so thresholds are calibrated locally.
 * A classifier is triage — never the only gate on untrusted text.
 */

export type ClassifierBackendName = 'openjev' | 'typesafe' | 'llm-enum';

/** Where request state goes. 'remote' backends must be refused for private scopes. */
export type ClassifierEgress = 'local' | 'remote';

/** Yes/no question; the answer is P(yes). */
export interface NoulQuestion {
  type: 'noul';
  instructions: string;
}

/** Pick one label. Values are optional per-label descriptions. */
export interface ChoiceQuestion {
  type: 'choice';
  instructions: string;
  labels: Record<string, string | null>;
}

/** Ordered rubric, scored from 0. At least two levels; entries may be null. */
export interface ScoreQuestion {
  type: 'score';
  instructions: string;
  levels: ReadonlyArray<string | null>;
}

export type ClassifierQuestion = NoulQuestion | ChoiceQuestion | ScoreQuestion;

export interface NoulAnswer {
  type: 'noul';
  /** P(yes), 0..1. */
  noul: number;
}

export interface ChoiceAnswer {
  type: 'choice';
  choice: string;
  confidence: number;
  /** Keyed by label; sums to ~1. */
  probabilities: Record<string, number>;
}

export interface ScoreAnswer {
  type: 'score';
  /** Expected score; may fall between integer levels. */
  score: number;
  confidence: number;
  /** Keyed by level index as a string ("0", "1", ...). */
  probabilities: Record<string, number>;
}

export type ClassifierAnswer = NoulAnswer | ChoiceAnswer | ScoreAnswer;

export interface ClassifyRequest {
  /** The material being judged. Treat as untrusted: it can steer the classifier. */
  state: Record<string, unknown> | string;
  /** Keyed by question name; answers come back under the same keys. */
  questions: Record<string, ClassifierQuestion>;
  /** Backend-specific model override (e.g. 'jev-latest', an OpenJev encoder). */
  model?: string;
}

export interface ClassifyResponse {
  answers: Record<string, ClassifierAnswer>;
  model: string;
  cost_usd: number;
  latency_ms: number;
  input_tokens?: number;
  raw?: unknown;
}

export interface ClassifierProvider {
  readonly name: ClassifierBackendName;
  readonly egress: ClassifierEgress;
  readonly concurrencyLimit: number;
  classify(req: ClassifyRequest): Promise<ClassifyResponse>;
}
