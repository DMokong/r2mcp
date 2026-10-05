import { LLMEnumClassifier } from './llm-enum.js';
import { OpenJevClassifier } from './openjev.js';
import { assertRemoteScopeAllowed } from './egress.js';
import { TypeSafeClassifier } from './typesafe.js';
import type { LLMProvider } from '../providers/types.js';
import type { ClassifierBackendName, ClassifierProvider } from './types.js';

export type * from './types.js';
export * from './system-one.js';
export * from './typesafe.js';
export * from './openjev.js';
export * from './llm-enum.js';
export { assertEgressAllowed, assertRemoteScopeAllowed, remoteClassifierScopes } from './egress.js';

const CLASSIFIER_NAMES: readonly ClassifierBackendName[] = ['openjev', 'typesafe', 'llm-enum'];

export interface SelectClassifierOptions {
  flag?: ClassifierBackendName;
  env?: NodeJS.ProcessEnv;
  llmProvider?: LLMProvider;
  /** Memory scope being classified. Required for the hosted 'typesafe' backend. */
  scope?: string;
  makeOpenJev?: () => ClassifierProvider;
  makeTypeSafe?: (scope: string) => ClassifierProvider;
  makeLLMEnum?: (provider: LLMProvider) => ClassifierProvider;
}

export function isClassifierBackendName(value: string): value is ClassifierBackendName {
  return (CLASSIFIER_NAMES as readonly string[]).includes(value);
}

export function selectClassifier(options: SelectClassifierOptions = {}): ClassifierProvider {
  const env = options.env ?? process.env;
  const raw = options.flag ?? env.R2MCP_CLASSIFIER_BACKEND ?? 'openjev';
  if (!isClassifierBackendName(raw)) {
    throw new Error(
      `R2MCP_CLASSIFIER_BACKEND=${raw} is not recognized. Use one of: ${CLASSIFIER_NAMES.join(', ')}.`,
    );
  }

  if (raw === 'openjev') {
    return options.makeOpenJev?.() ?? new OpenJevClassifier({ env });
  }
  if (raw === 'typesafe') {
    // Checked before any factory runs, so an injected factory cannot skip it.
    assertRemoteScopeAllowed(options.scope, env);
    const scope = options.scope as string;
    return options.makeTypeSafe?.(scope) ?? new TypeSafeClassifier({ scope, env });
  }
  if (!options.llmProvider) {
    throw new Error('Selecting llm-enum requires an existing LLMProvider.');
  }
  return options.makeLLMEnum?.(options.llmProvider) ?? new LLMEnumClassifier(options.llmProvider);
}
