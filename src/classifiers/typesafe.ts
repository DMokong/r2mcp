import { TypeSafeClient, type Fetch } from '@typesafe-ai/sdk';
import { fromSystemOneResult, toSystemOneRequest } from './system-one.js';
import type { ClassifierProvider, ClassifyRequest, ClassifyResponse } from './types.js';

const INPUT_PRICE_PER_MILLION_USD = 0.042;

export interface TypeSafeClassifierOptions {
  apiKey?: string;
  baseURL?: string;
  env?: NodeJS.ProcessEnv;
  fetchFn?: Fetch;
}

export class TypeSafeClassifier implements ClassifierProvider {
  readonly name = 'typesafe' as const;
  readonly egress = 'remote' as const;
  readonly concurrencyLimit = 10;

  private readonly client: TypeSafeClient;

  constructor(options: TypeSafeClassifierOptions = {}) {
    const env = options.env ?? process.env;
    const apiKey = firstNonBlank(options.apiKey, env.JEV_API_KEY, env.TYPESAFE_API_KEY);
    if (apiKey === undefined) {
      throw new Error(
        'A hosted Jev API key is required. Set JEV_API_KEY or TYPESAFE_API_KEY, or pass apiKey.',
      );
    }

    this.client = new TypeSafeClient({
      apiKey,
      baseURL: firstNonBlank(options.baseURL, env.TYPESAFE_BASE_URL),
      fetch: options.fetchFn,
    });
  }

  async classify(request: ClassifyRequest): Promise<ClassifyResponse> {
    const startedAt = Date.now();
    const result = await this.client.systemOne(toSystemOneRequest(request));
    const inputTokens = result.usage.input_tokens;

    return fromSystemOneResult(result, {
      latencyMs: Date.now() - startedAt,
      costUsd: (inputTokens * INPUT_PRICE_PER_MILLION_USD) / 1_000_000,
    });
  }
}

function firstNonBlank(...values: Array<string | undefined>): string | undefined {
  for (const value of values) {
    const trimmed = value?.trim();
    if (trimmed) return trimmed;
  }
  return undefined;
}
