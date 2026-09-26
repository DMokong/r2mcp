import type { ClassifierProvider } from './types.js';

/**
 * Scopes whose text may leave the machine for hosted Jev. `ai-landscape` is
 * the public AI-news corpus; `public-fixture` is the committed synthetic eval
 * fixture, granted only after its pinned content hash verifies.
 */
const DEFAULT_REMOTE_SCOPES = 'ai-landscape,public-fixture';

export function remoteClassifierScopes(env: NodeJS.ProcessEnv = process.env): Set<string> {
  return new Set(
    (env.R2MCP_REMOTE_CLASSIFIER_SCOPES ?? DEFAULT_REMOTE_SCOPES)
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean),
  );
}

/** Throws unless `scope` may be sent to hosted Jev. */
export function assertRemoteScopeAllowed(
  scope: string | undefined,
  env: NodeJS.ProcessEnv = process.env,
): void {
  if (scope === undefined || !remoteClassifierScopes(env).has(scope)) {
    throw new Error(
      `Hosted Jev egress is not allowed for scope "${scope ?? '(none)'}". ` +
        'Add an explicitly public scope to R2MCP_REMOTE_CLASSIFIER_SCOPES to allow it.',
    );
  }
}

/** Refuse hosted Jev before any private memory scope can leave the process. */
export function assertEgressAllowed(
  provider: ClassifierProvider,
  scope: string,
  env: NodeJS.ProcessEnv = process.env,
): void {
  if (provider.name !== 'typesafe') return;
  assertRemoteScopeAllowed(scope, env);
}
