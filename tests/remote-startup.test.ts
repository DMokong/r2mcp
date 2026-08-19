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
import { createServer, connect as netConnect } from 'node:net';
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

/**
 * Sends a hand-written HTTP/1.1 request over a raw TCP socket and returns the
 * bytes that come back ('' if the peer closed without answering — which is
 * exactly what a crashed server looks like from the client side).
 *
 * `fetch` cannot reach these code paths: it always emits a well-formed Host
 * header and a normalized request target, so the malformed-Host / unparseable
 * request-target crash found in round 1 was invisible to a fetch-based probe.
 */
function rawRequest(port: number, raw: string, timeoutMs = 4000): Promise<string> {
  return new Promise((resolveRaw, reject) => {
    const socket = netConnect({ host: '127.0.0.1', port });
    let data = '';
    const timer = setTimeout(() => {
      socket.destroy();
      resolveRaw(data);
    }, timeoutMs);
    socket.on('connect', () => socket.write(raw));
    socket.on('data', (chunk) => {
      data += chunk.toString();
    });
    socket.on('close', () => {
      clearTimeout(timer);
      resolveRaw(data);
    });
    socket.on('error', (err) => {
      clearTimeout(timer);
      reject(err);
    });
  });
}

/** True if 127.0.0.1:port can be bound right now (used to skip, not to guess). */
function isPortFree(port: number): Promise<boolean> {
  return new Promise((resolveFree) => {
    const srv = createServer();
    srv.once('error', () => resolveFree(false));
    srv.listen(port, '127.0.0.1', () => srv.close(() => resolveFree(true)));
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

  // Round-2 regression tests for the adversarial reviewer's F1: an empty or
  // syntactically invalid Host header used to build the URL base and killed the
  // process with an uncaught ERR_INVALID_URL — a ~40-byte unauthenticated
  // request could take the whole server down. Each test asserts BOTH that a
  // response comes back AND that the process is still alive and serving
  // afterwards (a crash shows up as an empty reply plus a dead child).
  it('F1: an empty Host header gets an HTTP response and does not kill the process', async () => {
    const reply = await rawRequest(
      port,
      'GET /health HTTP/1.1\r\nHost:\r\nConnection: close\r\n\r\n',
    );
    expect(reply).toMatch(/^HTTP\/1\.1 \d{3}/);
    expect(child.exitCode).toBeNull();
    expect(child.signalCode).toBeNull();
    // Still serving normal traffic, i.e. the request handler survived intact.
    const body = await waitForHealth(port, 2000);
    expect(body.name).toBe('r2mcp');
  });

  it('F1: a syntactically invalid Host header (`Host: ]`) gets an HTTP response and does not kill the process', async () => {
    const reply = await rawRequest(
      port,
      'GET /health HTTP/1.1\r\nHost: ]\r\nConnection: close\r\n\r\n',
    );
    expect(reply).toMatch(/^HTTP\/1\.1 \d{3}/);
    expect(child.exitCode).toBeNull();
    expect(child.signalCode).toBeNull();
    const body = await waitForHealth(port, 2000);
    expect(body.name).toBe('r2mcp');
  });

  it('F1: an unparseable request target (`GET //`) gets a 400 and does not kill the process', async () => {
    // `new URL('//', 'http://<any fixed base>')` throws ERR_INVALID_URL, so a
    // constant base alone is not enough — the parse itself must be guarded.
    const reply = await rawRequest(
      port,
      'GET // HTTP/1.1\r\nHost: 127.0.0.1\r\nConnection: close\r\n\r\n',
    );
    expect(reply).toMatch(/^HTTP\/1\.1 400/);
    expect(child.exitCode).toBeNull();
    expect(child.signalCode).toBeNull();
    const body = await waitForHealth(port, 2000);
    expect(body.name).toBe('r2mcp');
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

/**
 * Round-2 regression tests for the adversarial reviewer's F3: R2MCP_HTTP_PORT=''
 * used to slip through `??`, and Number('') === 0 cleared the range check, so a
 * blank var in a launchd plist or .env silently bound a random ephemeral port —
 * and the banner printed the requested constant, so the real port was not even
 * discoverable from the log.
 */
describe('R2MCP_HTTP_PORT resolution — deterministic or fail-loud, never silently random', () => {
  /** Spawns dist/remote.js and resolves with the port its startup banner reports. */
  function spawnRemoteUntilBanner(
    env: NodeJS.ProcessEnv,
    timeoutMs = 10000,
  ): Promise<{ child: ChildProcessWithoutNullStreams; bannerPort: number }> {
    return new Promise((resolveBanner, reject) => {
      const child = spawn('node', [REMOTE_ENTRY], { cwd: REPO_ROOT, env });
      longLivedChildren.push(child); // safety net; each test also kills its own
      let stderr = '';
      const timer = setTimeout(() => {
        child.kill('SIGKILL');
        reject(
          new Error(
            `dist/remote.js printed no startup banner within ${timeoutMs}ms — stderr=${JSON.stringify(stderr)}`,
          ),
        );
      }, timeoutMs);
      child.stderr.on('data', (d) => {
        stderr += d.toString();
        const match = /on http:\/\/127\.0\.0\.1:(\d+) /.exec(stderr);
        if (match) {
          clearTimeout(timer);
          resolveBanner({ child, bannerPort: Number(match[1]) });
        }
      });
      child.on('exit', (code) => {
        clearTimeout(timer);
        reject(
          new Error(`dist/remote.js exited (code ${code}) before listening — stderr=${JSON.stringify(stderr)}`),
        );
      });
      child.on('error', (err) => {
        clearTimeout(timer);
        reject(err);
      });
    });
  }

  it('F3: a non-numeric R2MCP_HTTP_PORT fails loud and names the variable', async () => {
    const env = baseEnv({ ...validEnvBase(), R2MCP_HTTP_PORT: 'not-a-port' });
    const result = await spawnRemoteUntilExit(env);
    expect(result.exitCode).not.toBe(0);
    expect(result.stderr).toContain('R2MCP_HTTP_PORT');
  });

  it('F3: an empty R2MCP_HTTP_PORT resolves to the documented default 8787, not a random ephemeral port', async (ctx) => {
    if (!(await isPortFree(8787))) {
      ctx.skip(
        '127.0.0.1:8787 is already in use on this machine (likely the deployed remote server), ' +
          'so the default-port binding cannot be observed here.',
      );
    }
    const env = baseEnv({ ...validEnvBase(), R2MCP_HTTP_PORT: '' });
    const { child, bannerPort } = await spawnRemoteUntilBanner(env);
    try {
      expect(bannerPort).toBe(8787);
      const body = await waitForHealth(8787, 4000);
      expect(body.name).toBe('r2mcp');
    } finally {
      killIfRunning(child);
    }
  }, 20000);

  it('F3: with R2MCP_HTTP_PORT=0 the banner reports the ACTUAL bound port, not the requested 0', async () => {
    const env = baseEnv({ ...validEnvBase(), R2MCP_HTTP_PORT: '0' });
    const { child, bannerPort } = await spawnRemoteUntilBanner(env);
    try {
      expect(bannerPort).toBeGreaterThan(0);
      // The banner is only useful if it is TRUE — the reported port must serve.
      const body = await waitForHealth(bannerPort, 4000);
      expect(body.name).toBe('r2mcp');
    } finally {
      killIfRunning(child);
    }
  }, 20000);
});
