// SPEC-059 (Task 02) — behavioral tests for dist/remote.js's own process
// lifecycle: fail-loud startup (AC4/R5), and a live HTTP smoke test of the
// built artifact (AC1 over the real streamable-HTTP transport, plus the
// GET /health shape and SIGTERM shutdown named in the brief's "Required
// content"). The module-graph/schema/no-spawn behavioral tests that don't
// need a real HTTP boot live in tests/remote-profile.test.ts.
//
// Ordering assumption (explicit per the brief): these tests spawn the BUILT
// dist/remote.js and deliberately do NOT run `npm run build` themselves —
// the verification commands and CI always run `npm run build && npm test`
// in that order, so dist/remote.js is fresh by the time this file executes.
// If dist/remote.js is stale or (pre-implementation) absent entirely, every
// test below fails with a clear spawn/connect error pointing at the missing
// file rather than a silent false pass.
//
// Every spawned child gets an explicit, minimal env (PATH/HOME/NODE_ENV plus
// only the R2MCP_* vars a given test sets) rather than inheriting the parent
// process's ambient env — the repo root's real .env carries live Supabase +
// OpenRouter credentials, and PROJECT_ROOT is pointed at an empty temp dir so
// remote.ts's own `.env` load can never pick that file up either.
import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { createServer } from 'node:net';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { setupTestDb, teardownTestDb } from './setup.js';
import { pickTestUrl } from './test-db-guard.js';

const REPO_ROOT = fileURLToPath(new URL('..', import.meta.url));
const REMOTE_ENTRY = resolve(REPO_ROOT, 'dist/remote.js');
const REMOTE_TEST_SCOPE = 'r2mcp-remote-startup-test';

let isolatedProjectRoot: string;
/** Short-lived children (the fail-loud spawns) — reaped after EVERY test. */
let activeChildren: ChildProcessWithoutNullStreams[] = [];
/**
 * Long-lived children (the shared HTTP server) — reaped only at end of FILE.
 *
 * Fixed in round 1 by the implementer: the HTTP-server child was originally
 * pushed onto `activeChildren`, so the `afterEach` below SIGKILLed it as soon
 * as the first test in its describe block finished. The remaining three tests
 * then failed with ECONNRESET / a 5s timeout against an already-dead process —
 * a harness bug, not a server bug (a manual boot of the same dist/remote.js
 * serves /health, POST /mcp, 404 and 405, and exits cleanly on SIGTERM; the
 * evidence is in the task report). Kept as a separate list so the fail-loud
 * spawns keep their per-test reaping and nothing leaks if a beforeAll throws.
 */
let longLivedChildren: ChildProcessWithoutNullStreams[] = [];

function killIfRunning(child: ChildProcessWithoutNullStreams): void {
  if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL');
}

beforeAll(async () => {
  await setupTestDb();
  isolatedProjectRoot = mkdtempSync(join(tmpdir(), 'r2mcp-remote-startup-'));
});

afterAll(async () => {
  for (const child of longLivedChildren) killIfRunning(child);
  longLivedChildren = [];
  await teardownTestDb();
  rmSync(isolatedProjectRoot, { recursive: true, force: true });
});

afterEach(() => {
  for (const child of activeChildren) killIfRunning(child);
  activeChildren = [];
});

function getFreePort(): Promise<number> {
  return new Promise((resolvePort, reject) => {
    const srv = createServer();
    srv.listen(0, () => {
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

/** Spawns dist/remote.js and waits for it to exit (used by the fail-loud tests). */
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

async function waitForHealth(
  port: number,
  timeoutMs: number,
): Promise<{ name: string; version: string; scope: string }> {
  const deadline = Date.now() + timeoutMs;
  let lastErr: unknown;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`http://127.0.0.1:${port}/health`);
      if (res.status === 200) {
        return (await res.json()) as { name: string; version: string; scope: string };
      }
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

describe('AC4 — dist/remote.js fails loud when required env is missing (R5)', () => {
  it('AC4: exits non-zero and names R2MCP_SCOPE in stderr when R2MCP_SCOPE is unset', async () => {
    const env = baseEnv({ ...validEnvBase(), R2MCP_SCOPE: undefined });
    const result = await spawnRemoteUntilExit(env);
    expect(result.exitCode).not.toBe(0);
    expect(result.stderr).toContain('R2MCP_SCOPE');
  });

  it('AC4: exits non-zero and names R2MCP_SCOPE in stderr when R2MCP_SCOPE is the empty string', async () => {
    const env = baseEnv({ ...validEnvBase(), R2MCP_SCOPE: '' });
    const result = await spawnRemoteUntilExit(env);
    expect(result.exitCode).not.toBe(0);
    expect(result.stderr).toContain('R2MCP_SCOPE');
  });

  it('AC4: exits non-zero and names R2MCP_DATABASE_URL in stderr when unset', async () => {
    const env = baseEnv({ ...validEnvBase(), R2MCP_DATABASE_URL: undefined });
    const result = await spawnRemoteUntilExit(env);
    expect(result.exitCode).not.toBe(0);
    expect(result.stderr).toContain('R2MCP_DATABASE_URL');
  });

  it('AC4: exits non-zero and names R2MCP_OPENROUTER_API_KEY in stderr when unset', async () => {
    const env = baseEnv({ ...validEnvBase(), R2MCP_OPENROUTER_API_KEY: undefined });
    const result = await spawnRemoteUntilExit(env);
    expect(result.exitCode).not.toBe(0);
    expect(result.stderr).toContain('R2MCP_OPENROUTER_API_KEY');
  });
});

describe('AC1 (HTTP) / R3 / R5 — dist/remote.js boots for real and serves streamable HTTP', () => {
  let port: number;
  let child: ChildProcessWithoutNullStreams;
  let baseUrl: URL;

  beforeAll(async () => {
    port = await getFreePort();
    const env = baseEnv({ ...validEnvBase(), R2MCP_HTTP_PORT: String(port) });
    child = spawn('node', [REMOTE_ENTRY], { cwd: REPO_ROOT, env });
    // Long-lived: shared by every test in this describe block, so it must
    // survive the file-level afterEach (see longLivedChildren above).
    longLivedChildren.push(child);
    baseUrl = new URL(`http://127.0.0.1:${port}/`);
    await waitForHealth(port, 8000);
  }, 15000);

  afterAll(async () => {
    if (child && child.exitCode === null && child.signalCode === null) {
      child.kill('SIGTERM');
      await new Promise((r) => setTimeout(r, 300));
      if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL');
    }
  });

  it('R5: GET /health returns 200 with {name, version, scope} for a fully-populated valid env', async () => {
    const body = await waitForHealth(port, 2000);
    expect(body.name).toBe('r2mcp');
    expect(body.scope).toBe(REMOTE_TEST_SCOPE);
    expect(typeof body.version).toBe('string');
    expect(body.version.length).toBeGreaterThan(0);
  });

  it('AC1: POST /mcp initialize + tools/list returns exactly recall, remember, search, stats, reject over real streamable HTTP', async () => {
    const transport = new StreamableHTTPClientTransport(new URL('mcp', baseUrl));
    const client = new Client({ name: 'http-listing-test-client', version: '0.0.0' });
    await client.connect(transport);
    try {
      const { tools } = await client.listTools();
      expect(tools.map((t) => t.name).sort()).toEqual(['recall', 'reject', 'remember', 'search', 'stats']);
    } finally {
      await client.close();
    }
  });

  it('R8: the server advertises REMOTE_INSTRUCTIONS as its MCP initialize instructions', async () => {
    const { REMOTE_INSTRUCTIONS } = await import('../src/register/remote-descriptions.js');
    const transport = new StreamableHTTPClientTransport(new URL('mcp', baseUrl));
    const client = new Client({ name: 'http-instructions-test-client', version: '0.0.0' });
    await client.connect(transport);
    try {
      expect(client.getInstructions()).toBe(REMOTE_INSTRUCTIONS);
    } finally {
      await client.close();
    }
  });

  it('unsupported path returns a non-2xx response (no bare tool surface outside /mcp and /health)', async () => {
    const res = await fetch(new URL('nonexistent', baseUrl));
    expect(res.status).toBeGreaterThanOrEqual(400);
  });

  // Declared LAST in this describe block — it terminates the shared server.
  it('R3: SIGTERM triggers a clean process exit (no stdin/parent-disconnect handling, no hang)', async () => {
    child.kill('SIGTERM');
    const exited = await new Promise<boolean>((resolveExit) => {
      const timer = setTimeout(() => resolveExit(false), 5000);
      child.once('exit', () => {
        clearTimeout(timer);
        resolveExit(true);
      });
    });
    expect(exited).toBe(true);
  });
});
