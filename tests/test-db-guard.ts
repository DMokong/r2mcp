// Test isolation guard (claw-0vsn).
//
// Without this, sourcing .env before `vitest run` causes test setup to wipe
// memories/memory_edges in whatever database R2MCP_DATABASE_URL points at —
// which is typically the production Supabase instance. Patient zero (2026-05-09)
// lost ~9 production memories and 72 edges this way.
//
// Behavior:
//   - If R2MCP_TEST_DATABASE_URL is set, use it (explicit override).
//   - Else if R2MCP_DATABASE_URL points at a local "*test*" db, use it.
//   - Else if R2MCP_DATABASE_URL is unset, fall back to the local default.
//   - Else throw, refusing to run.

export const TEST_URL_DEFAULT = 'postgresql://r2mcp:r2mcp@localhost:5432/r2mcp_test';

export function pickTestUrl(): string {
  const explicitTest = process.env.R2MCP_TEST_DATABASE_URL;
  if (explicitTest) return explicitTest;

  const ambient = process.env.R2MCP_DATABASE_URL;
  if (!ambient) return TEST_URL_DEFAULT;

  let parsed: URL;
  try {
    parsed = new URL(ambient);
  } catch {
    return TEST_URL_DEFAULT;
  }
  const isLocal = ['localhost', '127.0.0.1', '::1'].includes(parsed.hostname);
  const dbName = parsed.pathname.replace(/^\//, '');
  const looksLikeTestDb = /test/i.test(dbName);
  if (isLocal && looksLikeTestDb) return ambient;

  throw new Error(
    `[test-isolation] Refusing to run destructive tests against R2MCP_DATABASE_URL=${parsed.protocol}//${parsed.hostname}:${parsed.port || '<default>'}/${dbName}. ` +
    `Set R2MCP_TEST_DATABASE_URL to a dedicated test DB, or unset R2MCP_DATABASE_URL to use ${TEST_URL_DEFAULT}.`,
  );
}
