// SPEC-059 (Task 05) — behavioral tests for the remote server's MCP
// resource-server auth middleware (escalation 2026-08-20, plan.md Task 05,
// spec.md R6/AC7 + Anti-Patterns "hand-rolled OAuth").
//
// The brief names six required behaviors (task brief "Required content" §
// "Tests (behavioral, in tests/remote-auth.test.ts)"); each test below is
// tagged RT<n> for that exact list item so the mapping from test to
// requirement is legible without cross-referencing anything else:
//
//   RT1 — POST /mcp without a token -> 401 AND WWW-Authenticate contains
//         resource_metadata (the load-bearing assertion; the test is named
//         after it per the brief).
//   RT2 — GET /.well-known/oauth-protected-resource -> 200 JSON naming the
//         issuer.
//   RT3 — POST /mcp with a garbage/expired token -> 401, no tool execution
//         (two variants: syntactically garbage, and validly-signed-but-expired).
//   RT4 — POST /mcp with a valid token -> reaches the MCP layer (a real
//         `remember` call actually lands in the database).
//   RT5 — GET /health requires no auth.
//   RT6 — startup fails naming R2MCP_OAUTH_ISSUER / R2MCP_OAUTH_AUDIENCE when
//         missing (same fail-loud family as AC4/R5).
//
// Per the brief: "sign a test JWT with a local key pair and point the
// verifier at a locally-served JWKS ... do NOT call any real AS in tests."
// startFakeIssuer() below is exactly that local, in-process authorization
// server: it serves RFC 8414 AS metadata + a JWKS over a real 127.0.0.1
// socket (required — the implementation fetches issuer metadata over HTTP at
// startup, so a stub with no real socket would not exercise that path), and
// tokens are signed with jose against a key pair generated in-process. No
// network call ever leaves the test machine.
//
// PRE-IMPLEMENTATION STATE (expected at round 1): src/remote-auth.ts does not
// exist yet, and src/remote.ts does not yet require R2MCP_OAUTH_ISSUER /
// R2MCP_OAUTH_AUDIENCE nor mount any auth gate in front of /mcp. Every test
// below is written against the FINISHED contract and is expected to fail
// against the current code — see the task report for the failing-run tail
// and, for each test, why the specific failure demonstrates the requirement
// is genuinely unmet (not a harness bug).
import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { createServer, type Server as HttpServer } from 'node:http';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { generateKeyPair, exportJWK, SignJWT, type CryptoKey } from 'jose';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { setupTestDb, teardownTestDb } from './setup.js';
import { pickTestUrl } from './test-db-guard.js';
import type pg from 'pg';

const REPO_ROOT = fileURLToPath(new URL('..', import.meta.url));
const REMOTE_ENTRY = resolve(REPO_ROOT, 'dist/remote.js');
const REMOTE_TEST_SCOPE = 'r2mcp-remote-auth-test';

/* =====================================================================
 * Shared spawn/env plumbing — deliberately self-contained rather than
 * imported from tests/remote-startup.test.ts (matching that file's own
 * precedent of not sharing helpers across test files) and using an
 * explicit, minimal env for every spawned child for the same reason that
 * file documents: the repo root's real .env carries live credentials, and
 * PROJECT_ROOT is pointed at an isolated temp dir so remote.ts's own .env
 * load can never pick that file up either.
 * =================================================================== */

let isolatedProjectRoot: string;
let activeChildren: ChildProcessWithoutNullStreams[] = [];
let longLivedChildren: ChildProcessWithoutNullStreams[] = [];

function killIfRunning(child: ChildProcessWithoutNullStreams): void {
  if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL');
}

function baseEnv(overrides: Record<string, string | undefined>): NodeJS.ProcessEnv {
  const clean: NodeJS.ProcessEnv = {
    PATH: process.env.PATH,
    HOME: process.env.HOME,
    NODE_ENV: process.env.NODE_ENV,
  };
  for (const [key, value] of Object.entries(overrides)) {
    if (value === undefined) delete clean[key];
    else clean[key] = value;
  }
  return clean;
}

function validEnvBase(): Record<string, string> {
  return {
    R2MCP_SCOPE: REMOTE_TEST_SCOPE,
    R2MCP_DATABASE_URL: pickTestUrl(),
    R2MCP_OPENROUTER_API_KEY: 'sk-test-placeholder-not-a-real-key',
    PROJECT_ROOT: isolatedProjectRoot,
  };
}

interface SpawnResult {
  stdout: string;
  stderr: string;
  exitCode: number | null;
  signalCode: NodeJS.Signals | null;
}

/** Spawns dist/remote.js and waits for it to exit (used by the RT6 fail-loud tests). */
function spawnRemoteUntilExit(env: NodeJS.ProcessEnv, timeoutMs = 8000): Promise<SpawnResult> {
  return new Promise((resolveSpawn, reject) => {
    const child = spawn('node', [REMOTE_ENTRY], { cwd: REPO_ROOT, env });
    activeChildren.push(child);
    let stdout = '';
    let stderr = '';
    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      reject(
        new Error(
          `dist/remote.js did not exit within ${timeoutMs}ms (expected fail-loud exit) — ` +
            `stdout=${JSON.stringify(stdout)} stderr=${JSON.stringify(stderr)}`,
        ),
      );
    }, timeoutMs);
    child.stdout.on('data', (d) => {
      stdout += d.toString();
    });
    child.stderr.on('data', (d) => {
      stderr += d.toString();
    });
    child.on('exit', (code, signal) => {
      clearTimeout(timer);
      resolveSpawn({ stdout, stderr, exitCode: code, signalCode: signal });
    });
    child.on('error', (err) => {
      clearTimeout(timer);
      reject(err);
    });
  });
}

function getFreePort(): Promise<number> {
  return new Promise((resolvePort, reject) => {
    const srv = createServer();
    srv.listen(0, '127.0.0.1', () => {
      const address = srv.address();
      if (address && typeof address === 'object') {
        const port = address.port;
        srv.close(() => resolvePort(port));
      } else {
        srv.close(() => reject(new Error('could not allocate a free ephemeral port')));
      }
    });
    srv.on('error', reject);
  });
}

async function waitForHealth(port: number, timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  let lastErr: unknown;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`http://127.0.0.1:${port}/health`);
      if (res.status === 200) return;
      lastErr = new Error(`GET /health returned unexpected status ${res.status}`);
    } catch (err) {
      lastErr = err;
    }
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error(
    `GET /health on port ${port} did not return 200 within ${timeoutMs}ms: ${String(lastErr)}`,
  );
}

/* =====================================================================
 * The fake authorization server — a real HTTP socket on 127.0.0.1 serving
 * RFC 8414 AS metadata + a JWKS, and a jose-backed token signer. This is
 * the brief's "locally-served JWKS", never a real AS.
 * =================================================================== */

interface FakeIssuer {
  issuerUrl: string;
  kid: string;
  privateKey: CryptoKey;
  close: () => Promise<void>;
}

async function startFakeIssuer(): Promise<FakeIssuer> {
  const { publicKey, privateKey } = await generateKeyPair('RS256', { extractable: true });
  const kid = 'r2mcp-remote-auth-test-key';
  const publicJwk = await exportJWK(publicKey);
  const jwks = { keys: [{ ...publicJwk, kid, alg: 'RS256', use: 'sig' }] };

  let issuerUrl = '';
  const server: HttpServer = createServer((req, res) => {
    const path = (req.url ?? '').split('?')[0];
    if (path === '/.well-known/oauth-authorization-server') {
      res.writeHead(200, { 'Content-Type': 'application/json' }).end(
        JSON.stringify({
          issuer: issuerUrl,
          jwks_uri: `${issuerUrl}/.well-known/jwks.json`,
          authorization_endpoint: `${issuerUrl}/authorize`,
          token_endpoint: `${issuerUrl}/token`,
          response_types_supported: ['code'],
        }),
      );
      return;
    }
    if (path === '/.well-known/jwks.json') {
      res.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify(jwks));
      return;
    }
    res.writeHead(404, { 'Content-Type': 'application/json' }).end(JSON.stringify({ error: 'not_found' }));
  });

  await new Promise<void>((resolveListen) => server.listen(0, '127.0.0.1', resolveListen));
  const address = server.address();
  const port = address && typeof address === 'object' ? address.port : 0;
  issuerUrl = `http://127.0.0.1:${port}`;

  return {
    issuerUrl,
    kid,
    privateKey,
    close: () => new Promise<void>((res) => server.close(() => res())),
  };
}

async function signToken(
  issuer: FakeIssuer,
  opts: { aud: string; iss?: string; expEpochSeconds?: number },
): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  return new SignJWT({})
    .setProtectedHeader({ alg: 'RS256', kid: issuer.kid })
    .setIssuedAt(now)
    .setIssuer(opts.iss ?? issuer.issuerUrl)
    .setAudience(opts.aud)
    .setSubject('dustin-test-user')
    .setExpirationTime(opts.expEpochSeconds ?? now + 3600)
    .sign(issuer.privateKey);
}

const INITIALIZE_BODY = {
  jsonrpc: '2.0',
  id: 1,
  method: 'initialize',
  params: {
    protocolVersion: '2024-11-05',
    capabilities: {},
    clientInfo: { name: 'remote-auth-test-client', version: '0.0.0' },
  },
};

function rememberCallBody(content: string) {
  return {
    jsonrpc: '2.0',
    id: 1,
    method: 'tools/call',
    params: {
      name: 'remember',
      arguments: {
        operation: 'ADD',
        tier: 'preferences',
        content,
        metadata: { type: 'preference', topics: ['remote-auth-test'] },
      },
    },
  };
}

const MCP_POST_HEADERS = {
  'Content-Type': 'application/json',
  Accept: 'application/json, text/event-stream',
};

beforeAll(async () => {
  isolatedProjectRoot = mkdtempSync(join(tmpdir(), 'r2mcp-remote-auth-'));
});

afterAll(() => {
  for (const child of longLivedChildren) killIfRunning(child);
  longLivedChildren = [];
  rmSync(isolatedProjectRoot, { recursive: true, force: true });
});

/* =====================================================================
 * RT6 — fail-loud startup gate for the two new OAuth env vars
 * =================================================================== */

describe('RT6 — dist/remote.js fails loud when the OAuth env vars are missing', () => {
  // Dummy, non-resolving values for whichever var is NOT under test — the
  // fail-loud check for presence must fire before any network fetch of
  // issuer metadata, exactly like the existing R2MCP_SCOPE/DATABASE_URL/
  // OPENROUTER_API_KEY gate never tries to connect to Postgres first.
  function fullOauthEnv(): Record<string, string> {
    return {
      ...validEnvBase(),
      R2MCP_OAUTH_ISSUER: 'https://auth.example.invalid',
      R2MCP_OAUTH_AUDIENCE: 'https://mcp.example.invalid',
    };
  }

  afterEach(() => {
    for (const c of activeChildren) killIfRunning(c);
    activeChildren = [];
  });

  it(
    'RT6: exits non-zero and names R2MCP_OAUTH_ISSUER in stderr when unset',
    async () => {
      const env = baseEnv({ ...fullOauthEnv(), R2MCP_OAUTH_ISSUER: undefined });
      const result = await spawnRemoteUntilExit(env);
      expect(result.exitCode).not.toBe(0);
      expect(result.stderr).toContain('R2MCP_OAUTH_ISSUER');
    },
    10000,
  );

  it(
    'RT6: exits non-zero and names R2MCP_OAUTH_ISSUER in stderr when the empty string',
    async () => {
      const env = baseEnv({ ...fullOauthEnv(), R2MCP_OAUTH_ISSUER: '' });
      const result = await spawnRemoteUntilExit(env);
      expect(result.exitCode).not.toBe(0);
      expect(result.stderr).toContain('R2MCP_OAUTH_ISSUER');
    },
    10000,
  );

  it(
    'RT6: exits non-zero and names R2MCP_OAUTH_AUDIENCE in stderr when unset',
    async () => {
      const env = baseEnv({ ...fullOauthEnv(), R2MCP_OAUTH_AUDIENCE: undefined });
      const result = await spawnRemoteUntilExit(env);
      expect(result.exitCode).not.toBe(0);
      expect(result.stderr).toContain('R2MCP_OAUTH_AUDIENCE');
    },
    10000,
  );

  it(
    'RT6: exits non-zero and names R2MCP_OAUTH_AUDIENCE in stderr when the empty string',
    async () => {
      const env = baseEnv({ ...fullOauthEnv(), R2MCP_OAUTH_AUDIENCE: '' });
      const result = await spawnRemoteUntilExit(env);
      expect(result.exitCode).not.toBe(0);
      expect(result.stderr).toContain('R2MCP_OAUTH_AUDIENCE');
    },
    10000,
  );
});

/* =====================================================================
 * RT1–RT5 — the live, auth-enabled server (real fake-issuer round trip)
 * =================================================================== */

describe('remote-auth: resource-server middleware on POST /mcp (R6, AC7, escalation 2026-08-20)', () => {
  let issuer: FakeIssuer;
  let pool: pg.Pool;
  let port: number;
  let child: ChildProcessWithoutNullStreams;
  let baseUrl: URL;
  let audience: string;
  let validToken: string;

  beforeAll(async () => {
    pool = await setupTestDb();
    issuer = await startFakeIssuer();
    port = await getFreePort();
    audience = `http://127.0.0.1:${port}`;
    const env = baseEnv({
      ...validEnvBase(),
      R2MCP_HTTP_PORT: String(port),
      R2MCP_OAUTH_ISSUER: issuer.issuerUrl,
      R2MCP_OAUTH_AUDIENCE: audience,
    });
    child = spawn('node', [REMOTE_ENTRY], { cwd: REPO_ROOT, env });
    longLivedChildren.push(child);
    baseUrl = new URL(`http://127.0.0.1:${port}/`);
    await waitForHealth(port, 8000);
    validToken = await signToken(issuer, { aud: audience });
  }, 20000);

  afterAll(async () => {
    if (child && child.exitCode === null && child.signalCode === null) {
      child.kill('SIGTERM');
      await new Promise((r) => setTimeout(r, 300));
      if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL');
    }
    await issuer.close();
    await teardownTestDb();
  });

  beforeEach(async () => {
    // Sanity gate, run before EVERY test (not just once in beforeAll) so a
    // failure here fails each individual test with a clear, attributable
    // reason rather than lumping the whole describe block into one skipped
    // batch: prove this server build actually serves the RFC 9728
    // protected-resource metadata route before trusting anything below.
    const prm = await fetch(new URL('.well-known/oauth-protected-resource', baseUrl));
    expect(
      prm.status,
      'GET /.well-known/oauth-protected-resource did not return 200 — the resource-server auth ' +
        'layer (src/remote-auth.ts and its mount order in src/remote.ts) is not implemented/wired yet.',
    ).toBe(200);

    await pool.query('DELETE FROM memories WHERE project_scope = $1', [REMOTE_TEST_SCOPE]);
  });

  it('RT1: POST /mcp without an Authorization header is rejected 401 with WWW-Authenticate containing resource_metadata', async () => {
    const res = await fetch(new URL('mcp', baseUrl), {
      method: 'POST',
      headers: MCP_POST_HEADERS,
      body: JSON.stringify(INITIALIZE_BODY),
    });
    expect(res.status).toBe(401);
    // Load-bearing assertion (brief item 1) — the exact header claude.ai's
    // connector hard-requires (anthropics/claude-ai-mcp#410).
    const wwwAuth = res.headers.get('www-authenticate') ?? '';
    expect(wwwAuth).toContain('resource_metadata');
  });

  it('RT2: GET /.well-known/oauth-protected-resource returns 200 JSON naming the configured issuer', async () => {
    const res = await fetch(new URL('.well-known/oauth-protected-resource', baseUrl));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { authorization_servers?: string[]; resource?: string };
    expect(Array.isArray(body.authorization_servers)).toBe(true);
    expect(body.authorization_servers).toContain(issuer.issuerUrl);
  });

  it('RT3: POST /mcp with a syntactically garbage token is rejected 401 and the tool call never executes', async () => {
    const marker = `rt3-garbage-token-${Date.now()}`;
    const res = await fetch(new URL('mcp', baseUrl), {
      method: 'POST',
      headers: { ...MCP_POST_HEADERS, Authorization: 'Bearer not-a-real-jwt-at-all' },
      body: JSON.stringify(rememberCallBody(marker)),
    });
    expect(res.status).toBe(401);
    // Belt-and-suspenders behavioral proof (not a mock/call-count check): the
    // attempted remember() never lands a row, i.e. the tool handler itself
    // never ran.
    await new Promise((r) => setTimeout(r, 300));
    const row = await pool.query('SELECT id FROM memories WHERE content = $1', [marker]);
    expect(row.rows).toHaveLength(0);
  });

  it('RT3: POST /mcp with a validly-signed but expired token is rejected 401 and the tool call never executes', async () => {
    const marker = `rt3-expired-token-${Date.now()}`;
    const now = Math.floor(Date.now() / 1000);
    const expired = await signToken(issuer, { aud: audience, expEpochSeconds: now - 60 });
    const res = await fetch(new URL('mcp', baseUrl), {
      method: 'POST',
      headers: { ...MCP_POST_HEADERS, Authorization: `Bearer ${expired}` },
      body: JSON.stringify(rememberCallBody(marker)),
    });
    expect(res.status).toBe(401);
    await new Promise((r) => setTimeout(r, 300));
    const row = await pool.query('SELECT id FROM memories WHERE content = $1', [marker]);
    expect(row.rows).toHaveLength(0);
  });

  it('RT4: POST /mcp with a valid token reaches the MCP layer — a real remember() call lands in the database', async () => {
    const transport = new StreamableHTTPClientTransport(new URL('mcp', baseUrl), {
      requestInit: { headers: { Authorization: `Bearer ${validToken}` } },
    });
    const client = new Client({ name: 'rt4-valid-token-client', version: '0.0.0' });
    await client.connect(transport);
    try {
      const marker = `rt4-valid-token-${Date.now()}`;
      const result = await client.callTool({
        name: 'remember',
        arguments: {
          operation: 'ADD',
          tier: 'preferences',
          content: marker,
          metadata: { type: 'preference', topics: ['remote-auth-rt4-test'] },
        },
      });
      const textContent = (result.content as Array<{ type: string; text?: string }>).find(
        (c) => c.type === 'text',
      );
      expect(textContent?.text).toBeDefined();
      const parsed = JSON.parse(textContent!.text!) as { id?: string; operation?: string };
      expect(parsed.operation).toBe('ADD');
      expect(parsed.id).toBeDefined();

      // Real side effect, not a stub response: the row genuinely lands.
      const row = await pool.query('SELECT content, project_scope FROM memories WHERE id = $1', [
        parsed.id,
      ]);
      expect(row.rows).toHaveLength(1);
      expect(row.rows[0].content).toBe(marker);
      expect(row.rows[0].project_scope).toBe(REMOTE_TEST_SCOPE);
    } finally {
      await client.close();
    }
  });

  it('RT4: POST /mcp with a token signed by an untrusted key (wrong issuer keypair) is rejected 401', async () => {
    // Differentiates "any signed-looking JWT gets through" from genuine JWKS
    // signature verification — a token that is well-formed and unexpired but
    // signed by a DIFFERENT key than the one published at the issuer's
    // jwks_uri must still be rejected.
    const rogueIssuer = await startFakeIssuer();
    try {
      const rogueToken = await signToken(rogueIssuer, { aud: audience, iss: issuer.issuerUrl });
      const marker = `rt4-rogue-key-${Date.now()}`;
      const res = await fetch(new URL('mcp', baseUrl), {
        method: 'POST',
        headers: { ...MCP_POST_HEADERS, Authorization: `Bearer ${rogueToken}` },
        body: JSON.stringify(rememberCallBody(marker)),
      });
      expect(res.status).toBe(401);
      await new Promise((r) => setTimeout(r, 300));
      const row = await pool.query('SELECT id FROM memories WHERE content = $1', [marker]);
      expect(row.rows).toHaveLength(0);
    } finally {
      await rogueIssuer.close();
    }
  });

  it('RT5: GET /health requires no Authorization header', async () => {
    const res = await fetch(new URL('health', baseUrl));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { name: string; scope: string };
    expect(body.name).toBe('r2mcp');
    expect(body.scope).toBe(REMOTE_TEST_SCOPE);
  });
});
