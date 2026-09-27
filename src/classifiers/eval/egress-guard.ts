/**
 * Egress guard for the classifier eval runner (trk-7mx.1).
 *
 * Hosted Jev ('typesafe', egress='remote') may only see corpus sources listed
 * in R2MCP_REMOTE_CLASSIFIER_SCOPES — the same allow-list the backend enforces
 * (default ai-landscape,public-fixture), so the two guards cannot disagree.
 * DB-sampled private memory ('db-sample') is refused unless the owner lists it
 * explicitly for a run; he did once, 2026-09-27, for the trk-7mx comparison.
 * Every other backend (local, or
 * remote-but-not-typesafe such as the existing llm-enum/llm-path baseline
 * which already sends private content to Anthropic/OpenRouter today) is
 * unaffected — this guard narrows to the one new, less-trusted egress path.
 */

import { remoteClassifierScopes } from '../egress.js';

export type CorpusSource = 'db-sample' | 'public-fixture' | 'ai-landscape';

export interface EgressCheckedProvider {
  readonly name: string;
  readonly egress: 'local' | 'remote';
}

export class EgressGuardError extends Error {
  constructor(providerName: string, corpusSource: CorpusSource) {
    super(
      `Refusing to send a '${corpusSource}' corpus to remote backend "${providerName}": ` +
        `it is not in R2MCP_REMOTE_CLASSIFIER_SCOPES. Private memory needs the owner's explicit OK.`,
    );
    this.name = 'EgressGuardError';
  }
}

/** Throws EgressGuardError if this provider/corpus combination is forbidden. */
export function assertEgressAllowed(
  provider: EgressCheckedProvider,
  corpusSource: CorpusSource,
  env: NodeJS.ProcessEnv = process.env,
): void {
  if (
    provider.egress === 'remote' &&
    provider.name === 'typesafe' &&
    !remoteClassifierScopes(env).has(corpusSource)
  ) {
    throw new EgressGuardError(provider.name, corpusSource);
  }
}
