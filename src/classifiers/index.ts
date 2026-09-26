import { LLMEnumClassifier } from './llm-enum.js';
import { OpenJevClassifier } from './openjev.js';
import { TypeSafeClassifier } from './typesafe.js';
import type { LLMProvider } from '../providers/types.js';
import type { ClassifierBackendName, ClassifierProvider } from './types.js';

export type * from './types.js';
export * from './system-one.js';
export * from './typesafe.js';
export * from './openjev.js';
export * from './llm-enum.js';

const CLASSIFIER_NAMES: readonly ClassifierBackendName[] = ['openjev', 'typesafe', 'llm-enum'];
const DEFAULT_REMOTE_SCOPES = 'ai-landscape';

export interface SelectClassifierOptions {
  flag?: ClassifierBackendName;
  env?: NodeJS.ProcessEnv;
  llmProvider?: LLMProvider;
  makeOpenJev?: () => ClassifierProvider;
  makeTypeSafe?: () => ClassifierProvider;
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
    return options.makeTypeSafe?.() ?? new TypeSafeClassifier({ env });
  }
  if (!options.llmProvider) {
    throw new Error('Selecting llm-enum requires an existing LLMProvider.');
  }
  return options.makeLLMEnum?.(options.llmProvider) ?? new LLMEnumClassifier(options.llmProvider);
}

/** Refuse hosted Jev before any private memory scope can leave the process. */
export function assertEgressAllowed(
  provider: ClassifierProvider,
  scope: string,
  env: NodeJS.ProcessEnv = process.env,
): void {
  if (provider.name !== 'typesafe') return;

  const allowed = new Set(
    (env.R2MCP_REMOTE_CLASSIFIER_SCOPES ?? DEFAULT_REMOTE_SCOPES)
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean),
  );
  if (!allowed.has(scope)) {
    throw new Error(
      `Hosted Jev egress is not allowed for scope "${scope}". ` +
        'Add an explicitly public scope to R2MCP_REMOTE_CLASSIFIER_SCOPES to allow it.',
    );
  }
}
