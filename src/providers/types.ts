/**
 * LLMProvider interface — the runtime-configurable layer that lets the edge
 * classifier and the wiki compiler call into Anthropic SDK, Claude Code
 * headless (Max OAuth), or OpenRouter without baking a cost-mode assumption
 * into the architecture. SPEC-044 Section D.
 */

export type LogicalModel = 'haiku' | 'opus' | 'sonnet';

export type ProviderName = 'anthropic' | 'claude-code' | 'openrouter';

export interface CompleteRequest {
  model: LogicalModel;
  prompt: string;
  system?: string;
  max_tokens?: number;
}

export interface CompleteResponse {
  response: string;
  cost_usd: number;
  latency_ms: number;
  input_tokens?: number;
  output_tokens?: number;
  raw?: unknown;
}

export interface LLMProvider {
  readonly name: ProviderName;
  readonly concurrencyLimit: number;
  complete(req: CompleteRequest): Promise<CompleteResponse>;
}
