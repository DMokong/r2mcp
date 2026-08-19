#!/usr/bin/env node
// OTel instrumentation MUST be imported first — before any other module (AC8:
// remote tool calls emit the same spans/metrics stdio does).
import './instrumentation.js';

import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { resolve } from 'node:path';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { initDb, closeDb } from './db.js';
import { loadEnvFile, currentScope } from './env.js';
import { SERVER_VERSION } from './register/version.js';
import { registerRemoteProfile } from './register/remote-profile.js';
import { REMOTE_INSTRUCTIONS } from './register/remote-descriptions.js';

/**
 * SPEC-059 — the remote entry point: r2mcp's five safe tools over streamable
 * HTTP, for surfaces that can only reach a remote MCP connector (claude.ai
 * chat). It is a SECOND entry point, not a mode of the first: src/index.ts
 * (stdio, all eleven tools) is untouched, and this file's import graph has no
 * route to the six excluded tools, the CLI spawners, the graph rebuild, or
 * node:child_process. tests/remote-profile.test.ts enforces that on every run.
 *
 * Auth is NOT this layer's job — the Cloudflare edge in front of it owns that
 * (SPEC-059 R6). Nothing here inspects tokens.
 */

// MCP servers and launchd-spawned processes don't inherit shell env, so load
// .env ourselves — same convention as src/index.ts.
const PROJECT_ROOT = process.env.PROJECT_ROOT || process.cwd();
loadEnvFile(resolve(PROJECT_ROOT, '.env'));

/**
 * R5/AC4 — fail loud, refuse to start. Every one of these has a "helpful"
 * default somewhere in the codebase that is wrong for a public endpoint:
 * R2MCP_SCOPE falls back to 'global' (writes vanish into a never-curated
 * bucket), R2MCP_DATABASE_URL would only fail later on first use, and a
 * missing R2MCP_OPENROUTER_API_KEY silently degrades every recall to
 * full-text forever. Better to not exist than to serve any of those.
 */
const REQUIRED_ENV = ['R2MCP_SCOPE', 'R2MCP_DATABASE_URL', 'R2MCP_OPENROUTER_API_KEY'] as const;

for (const name of REQUIRED_ENV) {
  if (!(process.env[name] ?? '').trim()) {
    console.error(
      `[r2mcp-remote] refusing to start: ${name} is not set. ` +
        'The remote profile requires an explicit scope, database, and embeddings key — ' +
        'defaulting any of them would silently write to the wrong bucket or serve ' +
        'degraded (full-text-only) results indefinitely.',
    );
    process.exit(1);
  }
}

// claw-nyxd: resolve the project scope once at startup (after the .env load),
// exactly as src/index.ts does, so every request and /health report the same
// value.
const CURRENT_SCOPE = currentScope();

const DEFAULT_PORT = 8787;
// A blank/whitespace-only R2MCP_HTTP_PORT means "not configured", not "port 0":
// `??` alone would pass '' through, Number('') is 0, and listen(0) would bind a
// random ephemeral port that nothing could find again. A blank line in a
// launchd plist or .env is the realistic trigger, so treat it as unset and take
// the documented default — deterministic, never silently random.
const RAW_PORT = (process.env.R2MCP_HTTP_PORT ?? '').trim();
const PORT = RAW_PORT === '' ? DEFAULT_PORT : Number(RAW_PORT);
if (!Number.isInteger(PORT) || PORT < 0 || PORT > 65535) {
  console.error(
    `[r2mcp-remote] refusing to start: R2MCP_HTTP_PORT is not a valid port ` +
      `(got ${JSON.stringify(process.env.R2MCP_HTTP_PORT)}).`,
  );
  process.exit(1);
}

// Loopback only. The published surface is the Cloudflare tunnel, which runs on
// the same host; binding 0.0.0.0 would put an unauthenticated memory store on
// the LAN, which is precisely the blast radius this spec is trying to contain.
const HOST = '127.0.0.1';

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  if (res.headersSent) return;
  res.writeHead(status, { 'Content-Type': 'application/json' }).end(JSON.stringify(body));
}

/**
 * JSON-RPC-shaped error for the non-MCP outcomes (wrong path, wrong method,
 * handler blew up), per the SDK's stateless streamable-HTTP example — a client
 * that only speaks JSON-RPC still gets something it can parse.
 */
function sendJsonRpcError(
  res: ServerResponse,
  status: number,
  code: number,
  message: string,
): void {
  sendJson(res, status, { jsonrpc: '2.0', error: { code, message }, id: null });
}

/**
 * Routing path for a request, or `null` if the request target cannot be parsed.
 *
 * Two hazards, both of which used to kill the process with an uncaught
 * ERR_INVALID_URL from inside the createServer callback:
 *   1. The base was built from `req.headers.host`, which is attacker-controlled
 *      and need not be a valid authority — `Host:` (empty, which `??` does not
 *      catch) or `Host: ]` makes `new URL` throw. The base is now a fixed
 *      constant; we only ever route on the path, never on the client's Host.
 *   2. Even with a fixed base some request targets are unparseable — `GET //`
 *      throws ERR_INVALID_URL — so the parse itself is guarded.
 * A ~40-byte unauthenticated request must not be able to take the server down.
 */
const ROUTING_BASE = 'http://r2mcp.invalid';

function requestPath(req: IncomingMessage): string | null {
  try {
    return new URL(req.url ?? '/', ROUTING_BASE).pathname;
  } catch {
    return null;
  }
}

async function handleMcpPost(req: IncomingMessage, res: ServerResponse): Promise<void> {
  // Stateless mode (sessionIdGenerator: undefined) means a fresh McpServer +
  // transport per request: no session store, no cross-request state, and no
  // JSON-RPC request-id collisions between concurrent callers.
  const server = new McpServer(
    { name: 'r2mcp', version: SERVER_VERSION },
    { instructions: REMOTE_INSTRUCTIONS },
  );
  registerRemoteProfile(server, { scope: CURRENT_SCOPE });

  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
  res.on('close', () => {
    void transport.close();
    void server.close();
  });

  await server.connect(transport);
  await transport.handleRequest(req, res);
}

const httpServer = createServer((req, res) => {
  const path = requestPath(req);
  if (path === null) {
    sendJsonRpcError(res, 400, -32600, 'Invalid request target');
    return;
  }

  if (path === '/health') {
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      sendJsonRpcError(res, 405, -32000, 'Method not allowed.');
      return;
    }
    sendJson(res, 200, { name: 'r2mcp', version: SERVER_VERSION, scope: CURRENT_SCOPE });
    return;
  }

  if (path === '/mcp') {
    // Stateless mode has no standalone SSE stream to open and no session to
    // terminate, so GET and DELETE are unsupported here (SDK stateless example).
    if (req.method !== 'POST') {
      sendJsonRpcError(res, 405, -32000, 'Method not allowed.');
      return;
    }
    handleMcpPost(req, res).catch((err) => {
      console.error('[r2mcp-remote] error handling POST /mcp:', err);
      sendJsonRpcError(res, 500, -32603, 'Internal server error');
    });
    return;
  }

  sendJsonRpcError(res, 404, -32601, 'Not found');
});

/**
 * HTTP lifecycle, NOT stdio lifecycle: wireParentDisconnectHandlers() from
 * src/index.ts is deliberately absent — there is no parent pipe here, and
 * exiting on stdin EOF would kill a launchd-managed service the moment its
 * stdin closed. Signals are the only shutdown path.
 */
let shuttingDown = false;
async function shutdown(signal: string): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;
  console.error(`[r2mcp-remote] ${signal} received — shutting down`);
  // Don't let a lingering keep-alive connection hold the process open.
  httpServer.closeAllConnections();
  await new Promise<void>((done) => httpServer.close(() => done()));
  await closeDb();
  process.exit(0);
}

process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));

async function main(): Promise<void> {
  await initDb();
  console.error(`[r2mcp-remote] project scope: ${CURRENT_SCOPE}`);
  await new Promise<void>((listening) => httpServer.listen(PORT, HOST, listening));
  // Report the port the OS actually gave us, not the requested constant — with
  // PORT=0 (ephemeral) the requested value tells an operator nothing.
  const address = httpServer.address();
  const boundPort = address && typeof address === 'object' ? address.port : PORT;
  console.error(
    `[r2mcp-remote] r2mcp ${SERVER_VERSION} on http://${HOST}:${boundPort} (POST /mcp, GET /health)`,
  );
}

main().catch((err) => {
  console.error('[r2mcp-remote] fatal error:', err);
  process.exit(1);
});
