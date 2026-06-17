import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { pickTestUrl, enforceTestDbUrl, TEST_URL_DEFAULT } from './test-db-guard.js';

describe('pickTestUrl (claw-0vsn test-isolation guard)', () => {
  let savedAmbient: string | undefined;
  let savedExplicit: string | undefined;

  beforeEach(() => {
    savedAmbient = process.env.R2MCP_DATABASE_URL;
    savedExplicit = process.env.R2MCP_TEST_DATABASE_URL;
    delete process.env.R2MCP_DATABASE_URL;
    delete process.env.R2MCP_TEST_DATABASE_URL;
  });
  afterEach(() => {
    if (savedAmbient !== undefined) process.env.R2MCP_DATABASE_URL = savedAmbient;
    else delete process.env.R2MCP_DATABASE_URL;
    if (savedExplicit !== undefined) process.env.R2MCP_TEST_DATABASE_URL = savedExplicit;
    else delete process.env.R2MCP_TEST_DATABASE_URL;
  });

  it('falls back to the local test default when nothing is set', () => {
    expect(pickTestUrl()).toBe(TEST_URL_DEFAULT);
  });

  it('uses R2MCP_TEST_DATABASE_URL when set, even if production URL is also set', () => {
    process.env.R2MCP_TEST_DATABASE_URL = 'postgresql://test_user:pw@localhost:5432/anything';
    process.env.R2MCP_DATABASE_URL = 'postgresql://prod@aws-1.pooler.supabase.com:5432/postgres';
    expect(pickTestUrl()).toBe('postgresql://test_user:pw@localhost:5432/anything');
  });

  it('accepts an ambient URL when it is local AND has "test" in the db name', () => {
    process.env.R2MCP_DATABASE_URL = 'postgresql://r2mcp:r2mcp@localhost:5432/r2mcp_test';
    expect(pickTestUrl()).toBe('postgresql://r2mcp:r2mcp@localhost:5432/r2mcp_test');
  });

  it('accepts 127.0.0.1 as local', () => {
    process.env.R2MCP_DATABASE_URL = 'postgresql://r2mcp:r2mcp@127.0.0.1:5432/r2mcp_test';
    expect(pickTestUrl()).toBe('postgresql://r2mcp:r2mcp@127.0.0.1:5432/r2mcp_test');
  });

  it('REFUSES to run when ambient URL is a remote production-looking URL', () => {
    process.env.R2MCP_DATABASE_URL = 'postgresql://postgres.foo:pw@aws-1-ap-northeast-1.pooler.supabase.com:5432/postgres';
    expect(() => pickTestUrl()).toThrow(/Refusing to run destructive tests/);
  });

  it('REFUSES to run when ambient URL is local but db name lacks "test"', () => {
    process.env.R2MCP_DATABASE_URL = 'postgresql://r2mcp:r2mcp@localhost:5432/r2mcp';
    expect(() => pickTestUrl()).toThrow(/Refusing to run destructive tests/);
  });

  it('falls back to the default when ambient URL is malformed', () => {
    process.env.R2MCP_DATABASE_URL = 'not-a-valid-url';
    expect(pickTestUrl()).toBe(TEST_URL_DEFAULT);
  });

  // claw-i6td.2: the explicit override is validated too — a REMOTE test DB
  // requires an explicit opt-in so a fat-fingered remote URL can't slip through.
  it('REFUSES a remote R2MCP_TEST_DATABASE_URL without the escape hatch', () => {
    process.env.R2MCP_TEST_DATABASE_URL =
      'postgresql://u:pw@aws-1-ap-northeast-1.pooler.supabase.com:5432/postgres_test';
    expect(() => pickTestUrl()).toThrow(/remote/i);
  });

  it('allows a remote R2MCP_TEST_DATABASE_URL when R2MCP_ALLOW_REMOTE_TEST_DB=1', () => {
    const url = 'postgresql://u:pw@remote.example.com:5432/ci_test';
    process.env.R2MCP_TEST_DATABASE_URL = url;
    process.env.R2MCP_ALLOW_REMOTE_TEST_DB = '1';
    try {
      expect(pickTestUrl()).toBe(url);
    } finally {
      delete process.env.R2MCP_ALLOW_REMOTE_TEST_DB;
    }
  });
});

describe('enforceTestDbUrl (claw-i6td.2 structural guard)', () => {
  let saved: string | undefined;
  let savedTest: string | undefined;
  beforeEach(() => {
    saved = process.env.R2MCP_DATABASE_URL;
    savedTest = process.env.R2MCP_TEST_DATABASE_URL;
    delete process.env.R2MCP_TEST_DATABASE_URL;
  });
  afterEach(() => {
    if (saved === undefined) delete process.env.R2MCP_DATABASE_URL;
    else process.env.R2MCP_DATABASE_URL = saved;
    if (savedTest === undefined) delete process.env.R2MCP_TEST_DATABASE_URL;
    else process.env.R2MCP_TEST_DATABASE_URL = savedTest;
  });

  it('OVERRIDES a production ambient URL with a safe test URL (the wipe-prevention)', () => {
    process.env.R2MCP_DATABASE_URL =
      'postgresql://postgres.foo:pw@aws-1-ap-northeast-1.pooler.supabase.com:5432/postgres';
    enforceTestDbUrl();
    expect(process.env.R2MCP_DATABASE_URL).toBe(TEST_URL_DEFAULT);
    // ...and the result is itself a valid test URL (idempotent under pickTestUrl).
    expect(() => pickTestUrl()).not.toThrow();
  });

  it('preserves a valid local test ambient URL', () => {
    const local = 'postgresql://r2mcp:r2mcp@localhost:5432/r2mcp_test';
    process.env.R2MCP_DATABASE_URL = local;
    enforceTestDbUrl();
    expect(process.env.R2MCP_DATABASE_URL).toBe(local);
  });
});
