import Anthropic from '@anthropic-ai/sdk';
import type { TextBlock } from '@anthropic-ai/sdk/resources/messages';

export type EdgeModel = 'haiku' | 'opus';

const MODEL_IDS: Record<EdgeModel, string> = {
  haiku: 'claude-haiku-4-5-20251001',
  opus: 'claude-opus-4-7',
};

// Per-million-token prices (USD), public list price as of 2026-05.
const PRICES: Record<EdgeModel, { input: number; output: number }> = {
  haiku: { input: 0.80, output: 4.00 },
  opus:  { input: 15.00, output: 75.00 },
};

export interface CompletionResult {
  text: string;
  input_tokens: number;
  output_tokens: number;
  cost_usd: number;
}

export class EdgeAnthropicClient {
  private sdk: Anthropic;

  constructor() {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      throw new Error('ANTHROPIC_API_KEY is required for the edge classifier (separate from R2MCP_OPENROUTER_API_KEY).');
    }
    this.sdk = new Anthropic({ apiKey });
  }

  priceForTokens(model: EdgeModel, inputTokens: number, outputTokens: number): number {
    const p = PRICES[model];
    return (inputTokens / 1_000_000) * p.input + (outputTokens / 1_000_000) * p.output;
  }

  /**
   * Upper-bound cost estimate for one message. Uses ~4 chars/token as the
   * input estimate and assumes the response will use the full max_tokens budget.
   */
  estimateMessageCost(model: EdgeModel, prompt: string, maxOutputTokens: number): number {
    const inputTokens = Math.ceil(prompt.length / 4);
    return this.priceForTokens(model, inputTokens, maxOutputTokens);
  }

  async complete(
    model: EdgeModel,
    system: string,
    user: string,
    maxTokens: number,
  ): Promise<CompletionResult> {
    const response = await this.sdk.messages.create({
      model: MODEL_IDS[model],
      max_tokens: maxTokens,
      system,
      messages: [{ role: 'user', content: user }],
    });
    const text = response.content
      .filter((b): b is TextBlock => b.type === 'text')
      .map(b => b.text)
      .join('');
    const inputTokens = response.usage.input_tokens;
    const outputTokens = response.usage.output_tokens;
    const cost = this.priceForTokens(model, inputTokens, outputTokens);
    return { text, input_tokens: inputTokens, output_tokens: outputTokens, cost_usd: cost };
  }
}
