import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { getPool, closeDb, MISSING_DATABASE_URL_MESSAGE } from '../src/db.js';

// claw-8cjf.2: getPool must refuse to guess a database. The old behavior
// silently defaulted to postgresql://localhost:5432/r2mcp, which sent writes
// to the wrong database on misconfiguration and helped nobody (the Docker
// default is a different URL anyway).

let saved: string | undefined;

beforeEach(async () => {
  saved = process.env.R2MCP_DATABASE_URL;
  await closeDb(); // reset the lazy pool singleton
});

afterEach(async () => {
  if (saved === undefined) delete process.env.R2MCP_DATABASE_URL;
  else process.env.R2MCP_DATABASE_URL = saved;
  await closeDb();
});

describe('getPool fail-fast (claw-8cjf.2)', () => {
  it('throws when R2MCP_DATABASE_URL is unset instead of defaulting to localhost', () => {
    delete process.env.R2MCP_DATABASE_URL;
    expect(() => getPool()).toThrow(/R2MCP_DATABASE_URL/);
  });

  it('names both config surfaces and the Docker default in the error', () => {
    expect(MISSING_DATABASE_URL_MESSAGE).toContain('.mcp.json');
    expect(MISSING_DATABASE_URL_MESSAGE).toContain('.env');
    expect(MISSING_DATABASE_URL_MESSAGE).toContain('postgresql://r2mcp:r2mcp@localhost:5432/r2mcp');
  });

  it('constructs the pool normally when the var is set', () => {
    process.env.R2MCP_DATABASE_URL = 'postgresql://r2mcp:r2mcp@localhost:5432/r2mcp_test';
    expect(() => getPool()).not.toThrow();
  });
});
