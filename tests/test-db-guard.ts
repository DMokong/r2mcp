// Test isolation guard (claw-0vsn).
//
// Without this, sourcing .env before `vitest run` causes test setup to wipe
// memories/memory_edges in whatever database R2MCP_DATABASE_URL points at —
// which is typically the production Supabase instance. Patient zero (2026-05-09)
// lost ~9 production memories and 72 edges this way.
//
// Behavior:
//   - If R2MCP_TEST_DATABASE_URL is set, use it — but a REMOTE override requires
//     R2MCP_ALLOW_REMOTE_TEST_DB=1 (so a fat-fingered remote URL can't slip in).
//   - Else if R2MCP_DATABASE_URL points at a local "*test*" db, use it.
//   - Else if R2MCP_DATABASE_URL is unset, fall back to the local default.
//   - Else throw, refusing to run.
//
// claw-i6td.2 makes this STRUCTURAL: enforceTestDbUrl() runs as a vitest
// setupFile before every test module, overriding the process env so NO test —
// even one that reads R2MCP_DATABASE_URL directly — can ever reach production.

export const TEST_URL_DEFAULT = 'postgresql://r2mcp:r2mcp@localhost:5432/r2mcp_test';

function isLocalHost(parsed: URL): boolean {
  return ['localhost', '127.0.0.1', '::1'].includes(parsed.hostname);
}

export function pickTestUrl(): string {
  const explicitTest = process.env.R2MCP_TEST_DATABASE_URL;
  if (explicitTest) {
    // Validate the explicit override too: remote is allowed only with an
    // explicit opt-in (R2MCP_ALLOW_REMOTE_TEST_DB=1), e.g. a CI test service.
    let parsed: URL;
    try {
      parsed = new URL(explicitTest);
    } catch {
      return explicitTest; // unparseable — caller owns it
    }
    if (!isLocalHost(parsed) && process.env.R2MCP_ALLOW_REMOTE_TEST_DB !== '1') {
      throw new Error(
        `[test-isolation] R2MCP_TEST_DATABASE_URL points at a remote host (${parsed.hostname}). ` +
          `Set R2MCP_ALLOW_REMOTE_TEST_DB=1 to allow a remote test database.`,
      );
    }
    return explicitTest;
  }

  const ambient = process.env.R2MCP_DATABASE_URL;
  if (!ambient) return TEST_URL_DEFAULT;

  let parsed: URL;
  try {
    parsed = new URL(ambient);
  } catch {
    return TEST_URL_DEFAULT;
  }
  const dbName = parsed.pathname.replace(/^\//, '');
  const looksLikeTestDb = /test/i.test(dbName);
  if (isLocalHost(parsed) && looksLikeTestDb) return ambient;

  throw new Error(
    `[test-isolation] Refusing to run destructive tests against R2MCP_DATABASE_URL=${parsed.protocol}//${parsed.hostname}:${parsed.port || '<default>'}/${dbName}. ` +
      `Set R2MCP_TEST_DATABASE_URL to a dedicated test DB, or unset R2MCP_DATABASE_URL to use ${TEST_URL_DEFAULT}.`,
  );
}

/**
 * Structural guard (claw-i6td.2): force R2MCP_DATABASE_URL to a safe test URL
 * for the whole process. Runs as a vitest setupFile before every test module,
 * so even a test that reads R2MCP_DATABASE_URL directly (bypassing setupTestDb)
 * can never touch production. A non-test ambient URL is OVERRIDDEN with the
 * local test default (with a loud warning) rather than throwing — the suite
 * still runs, just safely.
 */
export function enforceTestDbUrl(): void {
  let safe: string;
  try {
    safe = pickTestUrl();
  } catch {
    safe = TEST_URL_DEFAULT;
    console.warn(
      `[test-isolation] R2MCP_DATABASE_URL pointed at a non-test database; ` +
        `overriding with ${safe} so tests cannot reach it.`,
    );
  }
  process.env.R2MCP_DATABASE_URL = safe;
}
