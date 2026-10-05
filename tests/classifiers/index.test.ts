import { describe, expect, it, vi } from 'vitest';
import {
  assertEgressAllowed,
  selectClassifier,
  type ClassifierProvider,
} from '../../src/classifiers/index.js';
import type { LLMProvider } from '../../src/providers/types.js';

function classifier(name: 'openjev' | 'typesafe' | 'llm-enum'): ClassifierProvider {
  return {
    name,
    egress: name === 'openjev' ? 'local' : 'remote',
    concurrencyLimit: 1,
    classify: vi.fn(),
  };
}

describe('selectClassifier', () => {
  it('defaults to OpenJev and lets a flag override the environment', () => {
    const openjev = classifier('openjev');
    const typesafe = classifier('typesafe');
    expect(selectClassifier({ env: {}, makeOpenJev: () => openjev })).toBe(openjev);
    expect(
      selectClassifier({
        flag: 'openjev',
        env: { R2MCP_CLASSIFIER_BACKEND: 'typesafe' },
        makeOpenJev: () => openjev,
        makeTypeSafe: () => typesafe,
      }),
    ).toBe(openjev);
  });

  it('selects TypeSafe from R2MCP_CLASSIFIER_BACKEND for a public scope', () => {
    const typesafe = classifier('typesafe');
    expect(
      selectClassifier({
        env: { R2MCP_CLASSIFIER_BACKEND: 'typesafe' },
        scope: 'ai-landscape',
        makeTypeSafe: () => typesafe,
      }),
    ).toBe(typesafe);
  });

  it('refuses TypeSafe for a private or missing scope before any factory runs', () => {
    const makeTypeSafe = vi.fn(() => classifier('typesafe'));
    for (const scope of ['claudeclaw', undefined]) {
      expect(() =>
        selectClassifier({ env: { R2MCP_CLASSIFIER_BACKEND: 'typesafe' }, scope, makeTypeSafe }),
      ).toThrow(/not allowed/);
    }
    expect(makeTypeSafe).not.toHaveBeenCalled();
  });

  it('requires an existing LLMProvider for llm-enum', () => {
    expect(() =>
      selectClassifier({ flag: 'llm-enum', env: {} }),
    ).toThrow(/existing LLMProvider/);

    const llm: LLMProvider = {
      name: 'openrouter',
      concurrencyLimit: 5,
      complete: vi.fn(),
    };
    expect(selectClassifier({ flag: 'llm-enum', env: {}, llmProvider: llm }).name).toBe(
      'llm-enum',
    );
  });

  it('rejects an unknown environment value', () => {
    expect(() => selectClassifier({ env: { R2MCP_CLASSIFIER_BACKEND: 'unknown' } })).toThrow(
      /not recognized/,
    );
  });
});

describe('assertEgressAllowed', () => {
  it('allows the default public scope and blocks other scopes for hosted Jev', () => {
    const hosted = classifier('typesafe');
    expect(() => assertEgressAllowed(hosted, 'ai-landscape', {})).not.toThrow();
    expect(() => assertEgressAllowed(hosted, 'private-notes', {})).toThrow(/not allowed/);
  });

  it('parses an explicit comma-separated allowlist', () => {
    const hosted = classifier('typesafe');
    const env = { R2MCP_REMOTE_CLASSIFIER_SCOPES: 'public-one, public-two ' };
    expect(() => assertEgressAllowed(hosted, 'public-two', env)).not.toThrow();
    expect(() => assertEgressAllowed(hosted, 'ai-landscape', env)).toThrow(/not allowed/);
  });

  it('does not restrict local OpenJev', () => {
    expect(() => assertEgressAllowed(classifier('openjev'), 'private-notes', {})).not.toThrow();
  });
});
