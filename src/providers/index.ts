/**
 * Public surface for the LLMProvider layer.
 *
 * Selection precedence (D.R3):
 *   1. `flag` (e.g., from --provider=...)
 *   2. R2MCP_CLASSIFIER_PROVIDER env var
 *   3. Auto-fallback: claude-code (if logged in) → anthropic (if API key)
 *      → openrouter (if API key) → ProviderUnavailableError
 */

import { AnthropicProvider } from './anthropic.js';
import { ClaudeCodeProvider, probeClaudeCode } from './claude-code.js';
import { OpenRouterProvider } from './openrouter.js';
import {
  NO_PROVIDER_AVAILABLE_MESSAGE,
  ProviderUnavailableError,
} from './errors.js';
import type { LLMProvider, ProviderName } from './types.js';

export type { CompleteRequest, CompleteResponse, LLMProvider, LogicalModel, ProviderName } from './types.js';
export { AnthropicProvider } from './anthropic.js';
export { ClaudeCodeProvider, probeClaudeCode } from './claude-code.js';
export { OpenRouterProvider } from './openrouter.js';
export { Semaphore } from './semaphore.js';
export { ProviderUnavailableError, NO_PROVIDER_AVAILABLE_MESSAGE } from './errors.js';

const PROVIDER_NAMES: ReadonlyArray<ProviderName> = ['anthropic', 'claude-code', 'openrouter'];

export function isProviderName(name: string): name is ProviderName {
  return (PROVIDER_NAMES as ReadonlyArray<string>).includes(name);
}

export interface SelectProviderOptions {
  /** Provider name from --provider=... flag. Highest precedence. */
  flag?: ProviderName;
  /** Process env (defaults to process.env). Tests override this. */
  env?: NodeJS.ProcessEnv;
  /** Probe whether Claude Code is logged in. Default uses real subprocess. */
  probeClaudeCode?: () => Promise<boolean>;
  /** Factory hooks (tests inject mocks; production uses defaults). */
  makeAnthropic?: (apiKey: string) => LLMProvider;
  makeClaudeCode?: () => LLMProvider;
  makeOpenRouter?: (apiKey: string) => LLMProvider;
}

export async function selectProvider(opts: SelectProviderOptions = {}): Promise<LLMProvider> {
  const env = opts.env ?? process.env;
  const probe = opts.probeClaudeCode ?? (() => probeClaudeCode());
  const makeAnthropic = opts.makeAnthropic ?? ((apiKey: string) => new AnthropicProvider({ apiKey }));
  const makeClaudeCode = opts.makeClaudeCode ?? (() => new ClaudeCodeProvider());
  const makeOpenRouter = opts.makeOpenRouter ?? ((apiKey: string) => new OpenRouterProvider({ apiKey }));

  // Precedence 1: explicit --provider flag
  const explicit = opts.flag ?? readEnvProviderName(env);
  if (explicit) {
    return instantiate(explicit, env, { makeAnthropic, makeClaudeCode, makeOpenRouter });
  }

  // Precedence 2: auto-fallback. Claude Code first (Max-covered, $0/call).
  if (await probe()) {
    return makeClaudeCode();
  }
  if (env.ANTHROPIC_API_KEY) {
    return makeAnthropic(env.ANTHROPIC_API_KEY);
  }
  if (env.R2MCP_OPENROUTER_API_KEY) {
    return makeOpenRouter(env.R2MCP_OPENROUTER_API_KEY);
  }
  throw new ProviderUnavailableError(NO_PROVIDER_AVAILABLE_MESSAGE);
}

function readEnvProviderName(env: NodeJS.ProcessEnv): ProviderName | undefined {
  const raw = env.R2MCP_CLASSIFIER_PROVIDER;
  if (!raw) return undefined;
  if (!isProviderName(raw)) {
    throw new ProviderUnavailableError(
      `R2MCP_CLASSIFIER_PROVIDER=${raw} is not a recognized provider. Use one of: ${PROVIDER_NAMES.join(', ')}`,
    );
  }
  return raw;
}

function instantiate(
  name: ProviderName,
  env: NodeJS.ProcessEnv,
  factories: {
    makeAnthropic: (apiKey: string) => LLMProvider;
    makeClaudeCode: () => LLMProvider;
    makeOpenRouter: (apiKey: string) => LLMProvider;
  },
): LLMProvider {
  if (name === 'claude-code') return factories.makeClaudeCode();
  if (name === 'anthropic') {
    const apiKey = env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      throw new ProviderUnavailableError(
        'ANTHROPIC_API_KEY is required when --provider=anthropic is selected.',
      );
    }
    return factories.makeAnthropic(apiKey);
  }
  // openrouter
  const apiKey = env.R2MCP_OPENROUTER_API_KEY;
  if (!apiKey) {
    throw new ProviderUnavailableError(
      'R2MCP_OPENROUTER_API_KEY is required when --provider=openrouter is selected.',
    );
  }
  return factories.makeOpenRouter(apiKey);
}
