import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { currentScope, DEFAULT_SCOPE } from '../src/env.js';

// claw-nyxd.2: R2MCP_SCOPE is the per-project namespace. Resolved once from the
// environment with a 'global' fallback that MUST equal the schema column default
// so an unset server stays coherent with backfilled rows.

let saved: string | undefined;

beforeEach(() => {
  saved = process.env.R2MCP_SCOPE;
});
afterEach(() => {
  if (saved === undefined) delete process.env.R2MCP_SCOPE;
  else process.env.R2MCP_SCOPE = saved;
});

describe('currentScope (claw-nyxd.2)', () => {
  it('falls back to the global default when R2MCP_SCOPE is unset', () => {
    delete process.env.R2MCP_SCOPE;
    expect(currentScope()).toBe('global');
    expect(DEFAULT_SCOPE).toBe('global');
  });

  it('returns the configured scope', () => {
    process.env.R2MCP_SCOPE = 'claudeclaw';
    expect(currentScope()).toBe('claudeclaw');
  });

  it('trims surrounding whitespace', () => {
    process.env.R2MCP_SCOPE = '  myproject  ';
    expect(currentScope()).toBe('myproject');
  });

  it('treats an empty/whitespace-only value as the default', () => {
    process.env.R2MCP_SCOPE = '   ';
    expect(currentScope()).toBe('global');
  });

  it('reads at call time, not import time (so subprocess env changes take effect)', () => {
    process.env.R2MCP_SCOPE = 'first';
    expect(currentScope()).toBe('first');
    process.env.R2MCP_SCOPE = 'second';
    expect(currentScope()).toBe('second');
  });
});
