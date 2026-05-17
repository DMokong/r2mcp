import type {
  CompleteRequest,
  CompleteResponse,
  LLMProvider,
  LogicalModel,
  ProviderName,
} from './types.js';

const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';

// OpenRouter routes Anthropic models under their own slugs. Logical model →
// OpenRouter slug. We pick the same family as the AnthropicProvider so cross-
// provider agreement (D.AC6) measures abstraction quality, not model swap.
const MODEL_IDS: Record<LogicalModel, string> = {
  haiku: 'anthropic/claude-haiku-4.5',
  opus: 'anthropic/claude-opus-4.7',
  sonnet: 'anthropic/claude-sonnet-4.6',
};

// OpenRouter passes through underlying model pricing. We approximate using
// the same Anthropic list prices — operator can override via env var if
// OpenRouter applies a markup.
const PRICES: Record<LogicalModel, { input: number; output: number }> = {
  haiku: { input: 0.8, output: 4.0 },
  opus: { input: 15.0, output: 75.0 },
  sonnet: { input: 3.0, output: 15.0 },
};

const DEFAULT_MAX_TOKENS = 256;

type FetchFn = typeof fetch;

export interface OpenRouterOptions {
  apiKey?: string;
  fetchFn?: FetchFn;
  /** Override the API endpoint (tests use this). */
  endpoint?: string;
}

export class OpenRouterProvider implements LLMProvider {
  readonly name: ProviderName = 'openrouter';
  readonly concurrencyLimit = 10;

  private readonly apiKey: string;
  private readonly fetchFn: FetchFn;
  private readonly endpoint: string;

  constructor(opts: OpenRouterOptions = {}) {
    const apiKey = opts.apiKey ?? process.env.R2MCP_OPENROUTER_API_KEY;
    if (!apiKey) {
      throw new Error('R2MCP_OPENROUTER_API_KEY is required to construct OpenRouterProvider');
    }
    this.apiKey = apiKey;
    this.fetchFn = opts.fetchFn ?? fetch;
    this.endpoint = opts.endpoint ?? OPENROUTER_URL;
  }

  static priceForTokens(model: LogicalModel, inputTokens: number, outputTokens: number): number {
    const p = PRICES[model];
    return (inputTokens / 1_000_000) * p.input + (outputTokens / 1_000_000) * p.output;
  }

  async complete(req: CompleteRequest): Promise<CompleteResponse> {
    const startedAt = Date.now();
    const messages: Array<{ role: 'system' | 'user'; content: string }> = [];
    if (req.system) messages.push({ role: 'system', content: req.system });
    messages.push({ role: 'user', content: req.prompt });

    const body = {
      model: MODEL_IDS[req.model],
      max_tokens: req.max_tokens ?? DEFAULT_MAX_TOKENS,
      messages,
    };
    const res = await this.fetchFn(this.endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.apiKey}`,
        'HTTP-Referer': 'https://github.com/DMokong/r2mcp',
        'X-Title': 'r2mcp-classifier',
      },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const errBody = await res.text();
      throw new Error(`OpenRouter ${res.status}: ${errBody.slice(0, 400)}`);
    }
    const data = (await res.json()) as {
      choices: Array<{ message: { content: string } }>;
      usage?: { prompt_tokens?: number; completion_tokens?: number };
    };
    const text = data.choices[0]?.message?.content ?? '';
    const inputTokens = data.usage?.prompt_tokens ?? 0;
    const outputTokens = data.usage?.completion_tokens ?? 0;
    return {
      response: text,
      cost_usd: OpenRouterProvider.priceForTokens(req.model, inputTokens, outputTokens),
      latency_ms: Date.now() - startedAt,
      input_tokens: inputTokens,
      output_tokens: outputTokens,
      raw: data,
    };
  }
}
