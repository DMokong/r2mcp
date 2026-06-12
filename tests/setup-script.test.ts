import { describe, it, expect } from 'vitest';
import { validateDatabaseUrl, classifySetupError, redactDatabaseUrl } from '../scripts/setup-helpers.js';

describe('redactDatabaseUrl()', () => {
  it('replaces password with *** in a standard URL', () => {
    expect(redactDatabaseUrl('postgresql://user:pass@host:5432/db')).toBe('postgresql://user:***@host:5432/db');
  });

  it('returns URL unchanged when there is no password (username only)', () => {
    const url = 'postgresql://user@host:5432/db';
    expect(redactDatabaseUrl(url)).toBe(url);
  });

  it('returns non-URL strings unchanged', () => {
    const str = 'not-a-url';
    expect(redactDatabaseUrl(str)).toBe(str);
  });
});

describe('validateDatabaseUrl()', () => {
  it('accepts a standard direct postgres URL', () => {
    expect(() => validateDatabaseUrl('postgresql://user:pass@localhost:5432/db')).not.toThrow();
  });

  it('accepts a Supabase direct URL (port 5432)', () => {
    expect(() =>
      validateDatabaseUrl('postgresql://postgres:pass@db.abc123.supabase.co:5432/postgres')
    ).not.toThrow();
  });

  it('rejects a transaction-pooler URL (port 6543) and points at the Session pooler', () => {
    expect(() =>
      validateDatabaseUrl('postgresql://postgres:pass@aws-0-ap-southeast-2.pooler.supabase.com:6543/postgres')
    ).toThrow(/session pooler/i);
  });

  it('rejects port 6543 on any host and mentions port 5432 in the error', () => {
    const error = (() => {
      try {
        validateDatabaseUrl('postgresql://user:pass@somehost.com:6543/mydb');
      } catch (e) { return e as Error; }
    })();
    expect(error?.message).toMatch(/port 5432/);
  });

  it('does not throw on an unparseable URL', () => {
    expect(() => validateDatabaseUrl('not-a-url')).not.toThrow();
  });
});

describe('classifySetupError()', () => {
  const url = 'postgresql://user:***@localhost:5432/db';

  it('classifies ECONNREFUSED as connection refused', () => {
    const err = Object.assign(new Error('connect ECONNREFUSED 127.0.0.1:5432'), { code: 'ECONNREFUSED' });
    const result = classifySetupError(err, url);
    expect(result.cause).toMatch(/connection refused/i);
    expect(result.fix).toMatch(/docker compose up/i);
  });

  it('classifies password auth failure', () => {
    const err = new Error('password authentication failed for user "postgres"');
    const result = classifySetupError(err, url);
    expect(result.cause).toMatch(/authentication failed/i);
    expect(result.fix).toMatch(/R2MCP_DATABASE_URL/);
  });

  it('classifies missing pgvector extension', () => {
    const err = new Error('extension "vector" is not available');
    const result = classifySetupError(err, url);
    expect(result.cause).toMatch(/pgvector/i);
    expect(result.fix).toMatch(/Supabase Dashboard/i);
  });

  it('classifies ETIMEDOUT as unreachable host with networking guidance', () => {
    const err = Object.assign(new Error('connect ETIMEDOUT 54.200.1.1:5432'), { code: 'ETIMEDOUT' });
    const result = classifySetupError(err, url);
    expect(result.cause).toMatch(/could not reach/i);
    expect(result.fix).toMatch(/Networking/i);
  });

  it('returns a generic fallback for unknown errors', () => {
    const err = new Error('some unexpected database error');
    const result = classifySetupError(err, url);
    expect(result.cause).toContain('some unexpected database error');
    expect(result.fix).toMatch(/R2MCP_DATABASE_URL/i);
  });
});

describe('classifySetupError — ENETUNREACH (claw-8cjf.5)', () => {
  const url = 'postgresql://user:***@db.abcdef.supabase.co:5432/postgres';

  it('classifies ENETUNREACH as an IPv6 reachability problem pointing at the session pooler', () => {
    const err = Object.assign(new Error('connect ENETUNREACH 2406:da14:271:9901::1:5432'), {
      code: 'ENETUNREACH',
    });
    const result = classifySetupError(err, url);
    expect(result.cause).toMatch(/ipv6/i);
    expect(result.fix).toMatch(/session pooler/i);
    expect(result.fix).toMatch(/pooler\.supabase\.com/);
  });

  it('classifies message-only ENETUNREACH the same way', () => {
    const err = new Error('connect ENETUNREACH 2406:da14:271:9901::1:5432');
    const result = classifySetupError(err, url);
    expect(result.fix).toMatch(/session pooler/i);
  });
});
