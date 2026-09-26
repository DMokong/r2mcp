import { TypeSafeClient, type Fetch } from '@typesafe-ai/sdk';
import { fromSystemOneResult, toSystemOneRequest } from './system-one.js';
import type { ClassifierProvider, ClassifyRequest, ClassifyResponse } from './types.js';

const DEFAULT_OPENJEV_URL = 'http://127.0.0.1:8765';
const LOCAL_API_KEY_PLACEHOLDER = 'openjev-local';

export interface OpenJevClassifierOptions {
  baseURL?: string;
  env?: NodeJS.ProcessEnv;
  fetchFn?: Fetch;
}

export class OpenJevClassifier implements ClassifierProvider {
  readonly name = 'openjev' as const;
  readonly egress = 'local' as const;
  readonly concurrencyLimit = 10;

  private readonly client: TypeSafeClient;

  constructor(options: OpenJevClassifierOptions = {}) {
    const env = options.env ?? process.env;
    const baseURL =
      nonBlank(options.baseURL) ?? nonBlank(env.R2MCP_OPENJEV_URL) ?? DEFAULT_OPENJEV_URL;

    this.client = new TypeSafeClient({
      apiKey: LOCAL_API_KEY_PLACEHOLDER,
      baseURL,
      fetch: options.fetchFn,
    });
  }

  async classify(request: ClassifyRequest): Promise<ClassifyResponse> {
    const startedAt = Date.now();
    const result = await this.client.systemOne(toSystemOneRequest(request));

    return fromSystemOneResult(result, {
      latencyMs: Date.now() - startedAt,
      costUsd: 0,
    });
  }
}

function nonBlank(value: string | undefined): string | undefined {
  return value?.trim() || undefined;
}
