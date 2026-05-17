import Anthropic from '@anthropic-ai/sdk';
import type { TextBlock } from '@anthropic-ai/sdk/resources/messages';
import type {
  CompleteRequest,
  CompleteResponse,
  LLMProvider,
  LogicalModel,
  ProviderName,
} from './types.js';

const MODEL_IDS: Record<LogicalModel, string> = {
  haiku: 'claude-haiku-4-5-20251001',
  opus: 'claude-opus-4-7',
  sonnet: 'claude-sonnet-4-6',
};

// Per-million-token list prices (USD), public list price as of 2026-05.
const PRICES: Record<LogicalModel, { input: number; output: number }> = {
  haiku: { input: 0.8, output: 4.0 },
  opus: { input: 15.0, output: 75.0 },
  sonnet: { input: 3.0, output: 15.0 },
};

const DEFAULT_MAX_TOKENS = 256;

export class AnthropicProvider implements LLMProvider {
  readonly name: ProviderName = 'anthropic';
  readonly concurrencyLimit = 10;
  private sdk: Anthropic;

  constructor(opts: { apiKey?: string; sdk?: Anthropic } = {}) {
    if (opts.sdk) {
      this.sdk = opts.sdk;
      return;
    }
    const apiKey = opts.apiKey ?? process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      throw new Error('ANTHROPIC_API_KEY is required to construct AnthropicProvider');
    }
    this.sdk = new Anthropic({ apiKey });
  }

  static priceForTokens(model: LogicalModel, inputTokens: number, outputTokens: number): number {
    const p = PRICES[model];
    return (inputTokens / 1_000_000) * p.input + (outputTokens / 1_000_000) * p.output;
  }

  async complete(req: CompleteRequest): Promise<CompleteResponse> {
    const startedAt = Date.now();
    const response = await this.sdk.messages.create({
      model: MODEL_IDS[req.model],
      max_tokens: req.max_tokens ?? DEFAULT_MAX_TOKENS,
      system: req.system,
      messages: [{ role: 'user', content: req.prompt }],
    });
    const text = response.content
      .filter((b): b is TextBlock => b.type === 'text')
      .map((b) => b.text)
      .join('');
    const inputTokens = response.usage.input_tokens;
    const outputTokens = response.usage.output_tokens;
    return {
      response: text,
      cost_usd: AnthropicProvider.priceForTokens(req.model, inputTokens, outputTokens),
      latency_ms: Date.now() - startedAt,
      input_tokens: inputTokens,
      output_tokens: outputTokens,
      raw: response,
    };
  }
}
