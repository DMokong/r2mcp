import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { pickTestUrl, TEST_URL_DEFAULT } from './test-db-guard.js';

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
});
