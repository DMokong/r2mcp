import { describe, it, expect } from 'vitest';
import { assertEgressAllowed, EgressGuardError } from '../../src/classifiers/eval/egress-guard.js';

describe('assertEgressAllowed', () => {
  it('refuses a DB-sampled corpus for the remote typesafe backend', () => {
    expect(() => assertEgressAllowed({ name: 'typesafe', egress: 'remote' }, 'db-sample')).toThrow(
      EgressGuardError,
    );
  });

  it('allows the public fixture for the remote typesafe backend', () => {
    expect(() => assertEgressAllowed({ name: 'typesafe', egress: 'remote' }, 'public-fixture')).not.toThrow();
  });

  it('allows the ai-landscape scope for the remote typesafe backend', () => {
    expect(() => assertEgressAllowed({ name: 'typesafe', egress: 'remote' }, 'ai-landscape')).not.toThrow();
  });

  it('allows a DB-sampled corpus for a local backend regardless of name', () => {
    expect(() => assertEgressAllowed({ name: 'openjev', egress: 'local' }, 'db-sample')).not.toThrow();
  });

  it('allows a DB-sampled corpus for a remote backend that is not typesafe', () => {
    // llm-enum wraps the existing LLMProvider path, which already sends private
    // memory content to Anthropic/OpenRouter today — this guard narrows to the
    // one new, less-trusted hosted-Jev egress path, not every remote backend.
    expect(() => assertEgressAllowed({ name: 'llm-enum', egress: 'remote' }, 'db-sample')).not.toThrow();
  });

  it('names the provider and corpus source in the error message', () => {
    try {
      assertEgressAllowed({ name: 'typesafe', egress: 'remote' }, 'db-sample');
      expect.unreachable();
    } catch (err) {
      expect(err).toBeInstanceOf(EgressGuardError);
      expect((err as Error).message).toContain('typesafe');
      expect((err as Error).message).toContain('db-sample');
    }
  });

  it('follows R2MCP_REMOTE_CLASSIFIER_SCOPES: db-sample only when listed explicitly', () => {
    const hosted = { name: 'typesafe', egress: 'remote' as const };
    expect(() => assertEgressAllowed(hosted, 'db-sample', {})).toThrow(EgressGuardError);
    expect(() =>
      assertEgressAllowed(hosted, 'db-sample', { R2MCP_REMOTE_CLASSIFIER_SCOPES: 'ai-landscape,db-sample' }),
    ).not.toThrow();
    expect(() =>
      assertEgressAllowed(hosted, 'ai-landscape', { R2MCP_REMOTE_CLASSIFIER_SCOPES: 'db-sample' }),
    ).toThrow(EgressGuardError);
  });
});
