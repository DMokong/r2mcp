import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  embeddingWarning,
  EMBEDDINGS_DISABLED_WARNING,
  EMBEDDING_FAILED_WARNING,
} from '../src/embeddings.js';

// claw-8cjf.2: a null embedding must be explainable. Key absent → deterministic
// "disabled" warning naming the env var; key present → the embed call failed.

let savedKey: string | undefined;

beforeEach(() => {
  savedKey = process.env.R2MCP_OPENROUTER_API_KEY;
});

afterEach(() => {
  if (savedKey === undefined) delete process.env.R2MCP_OPENROUTER_API_KEY;
  else process.env.R2MCP_OPENROUTER_API_KEY = savedKey;
});

describe('embeddingWarning (claw-8cjf.2)', () => {
  it('returns the disabled warning when the embedding is null and no key is set', () => {
    delete process.env.R2MCP_OPENROUTER_API_KEY;
    expect(embeddingWarning(null)).toBe(EMBEDDINGS_DISABLED_WARNING);
    expect(EMBEDDINGS_DISABLED_WARNING).toContain('R2MCP_OPENROUTER_API_KEY');
  });

  it('returns the failed warning when the embedding is null despite a key', () => {
    process.env.R2MCP_OPENROUTER_API_KEY = 'sk-or-v1-test';
    expect(embeddingWarning(null)).toBe(EMBEDDING_FAILED_WARNING);
    expect(EMBEDDING_FAILED_WARNING).toMatch(/failed/i);
  });

  it('returns null when an embedding is present', () => {
    delete process.env.R2MCP_OPENROUTER_API_KEY;
    expect(embeddingWarning([0.1, 0.2])).toBeNull();
  });
});
