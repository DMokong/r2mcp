/**
 * Egress guard for the classifier eval runner (trk-7mx.1).
 *
 * Hard rule from the harness brief: hosted Jev ('typesafe', egress='remote')
 * may only ever see the public synthetic fixture or the 'ai-landscape' scope
 * — never DB-sampled private memory text. Every other backend (local, or
 * remote-but-not-typesafe such as the existing llm-enum/llm-path baseline
 * which already sends private content to Anthropic/OpenRouter today) is
 * unaffected — this guard narrows to the one new, less-trusted egress path.
 */

export type CorpusSource = 'db-sample' | 'public-fixture' | 'ai-landscape';

export interface EgressCheckedProvider {
  readonly name: string;
  readonly egress: 'local' | 'remote';
}

export class EgressGuardError extends Error {
  constructor(providerName: string, corpusSource: CorpusSource) {
    super(
      `Refusing to send a '${corpusSource}' corpus to remote backend "${providerName}": ` +
        `hosted Jev may only ever see the public fixture or the 'ai-landscape' scope, ` +
        `never DB-sampled private memory text.`,
    );
    this.name = 'EgressGuardError';
  }
}

/** Throws EgressGuardError if this provider/corpus combination is forbidden. */
export function assertEgressAllowed(
  provider: EgressCheckedProvider,
  corpusSource: CorpusSource,
): void {
  if (provider.egress === 'remote' && provider.name === 'typesafe' && corpusSource === 'db-sample') {
    throw new EgressGuardError(provider.name, corpusSource);
  }
}
