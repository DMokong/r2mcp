#!/usr/bin/env node
// OTel instrumentation MUST be imported first — before any other module (AC8:
// remote tool calls emit the same spans/metrics stdio does).
import './instrumentation.js';

// express@5 ships no type declarations of its own, and this task's dependency
// budget is exactly `express` + `jose` (brief 05 "File scope"/"Out of scope"
// forbid a third package, including `@types/express`). The import is therefore
// suppressed once, here, and immediately narrowed to the `ExpressApp` interface
// below — nothing downstream of this line is untyped.
// @ts-expect-error untyped module: express@5 bundles no type declarations
import express from 'express';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { resolve } from 'node:path';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { requireBearerAuth } from '@modelcontextprotocol/sdk/server/auth/middleware/bearerAuth.js';
import { mcpAuthMetadataRouter } from '@modelcontextprotocol/sdk/server/auth/router.js';
import { initDb, closeDb } from './db.js';
import { loadEnvFile, currentScope } from './env.js';
import { SERVER_VERSION } from './register/version.js';
import { registerRemoteProfile } from './register/remote-profile.js';
import { REMOTE_INSTRUCTIONS } from './register/remote-descriptions.js';
import { createRemoteAuth, type RemoteAuth } from './remote-auth.js';

/**
 * SPEC-059 — the remote entry point: r2mcp's five safe tools over streamable
 * HTTP, for surfaces that can only reach a remote MCP connector (claude.ai
 * chat). It is a SECOND entry point, not a mode of the first: src/index.ts
 * (stdio, all eleven tools) is untouched, and this file's import graph has no
 * route to the six excluded tools, the CLI spawners, the graph rebuild, or
 * node:child_process. tests/remote-profile.test.ts enforces that on every run.
 *
 * Auth IS this layer's job (revised by the 2026-08-20 escalation, plan.md Task
 * 05): the server plays the MCP authorization spec's resource-server role
 * itself — every unauthenticated `/mcp` request gets a 401 carrying
 * `WWW-Authenticate: Bearer resource_metadata="…"`, which is the header
 * claude.ai's connector hard-requires and which Cloudflare Access's Managed
 * OAuth does not emit (anthropics/claude-ai-mcp#410). The edge still provides
 * the tunnel/TLS, but the 401 contract no longer depends on it, and the server
 * is safe even if the tunnel is reached directly. Token *issuance* remains
 * entirely the external authorization server's job — see src/remote-auth.ts.
 */

// MCP servers and launchd-spawned processes don't inherit shell env, so load
// .env ourselves — same convention as src/index.ts.
const PROJECT_ROOT = process.env.PROJECT_ROOT || process.cwd();
loadEnvFile(resolve(PROJECT_ROOT, '.env'));

/**
 * R5/AC4 — fail loud, refuse to start. Every one of these has a "helpful"
 * default somewhere in the codebase (or in the ecosystem) that is wrong for a
 * public endpoint: R2MCP_SCOPE falls back to 'global' (writes vanish into a
 * never-curated bucket), R2MCP_DATABASE_URL would only fail later on first use,
 * a missing R2MCP_OPENROUTER_API_KEY silently degrades every recall to
 * full-text forever, and defaulting either OAuth variable would mean shipping a
 * memory store whose bearer tokens are checked against nothing. Better to not
 * exist than to serve any of those.
 */
const REQUIRED_ENV = [
  'R2MCP_SCOPE',
  'R2MCP_DATABASE_URL',
  'R2MCP_OPENROUTER_API_KEY',
  'R2MCP_OAUTH_ISSUER',
  'R2MCP_OAUTH_AUDIENCE',
] as const;

for (const name of REQUIRED_ENV) {
  if (!(process.env[name] ?? '').trim()) {
    console.error(
      `[r2mcp-remote] refusing to start: ${name} is not set. ` +
        'The remote profile requires an explicit scope, database, embeddings key, ' +
        'OAuth issuer and OAuth audience — defaulting any of them would silently ' +
        'write to the wrong bucket, serve degraded (full-text-only) results ' +
        'indefinitely, or expose the memory store with no token verification.',
    );
    process.exit(1);
  }
}

// claw-nyxd: resolve the project scope once at startup (after the .env load),
// exactly as src/index.ts does, so every request and /health report the same
// value.
const CURRENT_SCOPE = currentScope();

/**
 * The external authorization server's issuer identifier, and this resource
 * server's own canonical identifier. Nothing here hardcodes a vendor: any
 * spec-compliant AS (Auth0 tenant, an Access app that emits the header, …)
 * plugs in through these two variables alone.
 */
const OAUTH_ISSUER = (process.env.R2MCP_OAUTH_ISSUER ?? '').trim();
const OAUTH_AUDIENCE = (process.env.R2MCP_OAUTH_AUDIENCE ?? '').trim();

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
// the same host; binding 0.0.0.0 would put a memory store on the LAN, which is
// precisely the blast radius this spec is trying to contain.
const HOST = '127.0.0.1';

/* =====================================================================
 * The slice of express's Application surface this file uses.
 *
 * Handlers are typed against node's own IncomingMessage/ServerResponse — which
 * express's request/response objects extend — because every handler below
 * writes its reply through sendJson()/the SDK transport, i.e. through the node
 * API, never through express-only sugar like `res.json()`. That keeps this
 * shim small enough to be obviously correct while leaving each handler fully
 * type-checked. Values coming back from the SDK's auth helpers are `any` (the
 * SDK types them against express, which resolves to `any` here) and so satisfy
 * these parameter types without a cast.
 * =================================================================== */
type ExpressNext = (err?: unknown) => void;
type ExpressHandler = (req: IncomingMessage, res: ServerResponse, next: ExpressNext) => void;
type ExpressErrorHandler = (
  err: unknown,
  req: IncomingMessage,
  res: ServerResponse,
  next: ExpressNext,
) => void;

interface ExpressApp {
  (req: IncomingMessage, res: ServerResponse): void;
  use(handler: ExpressHandler): ExpressApp;
  use(handler: ExpressErrorHandler): ExpressApp;
  use(path: string, handler: ExpressHandler): ExpressApp;
  get(path: string, handler: ExpressHandler): ExpressApp;
  post(path: string, handler: ExpressHandler): ExpressApp;
  all(path: string, handler: ExpressHandler): ExpressApp;
}

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
 * Kept from the hand-rolled router (Task 02, round 2) as an explicit guard in
 * front of express rather than dropped with it: `GET //` is an unparseable
 * request target, and answering it with the same 400 as before keeps that
 * regression test honest instead of letting it silently become "some 4xx".
 * A ~40-byte unauthenticated request must not be able to take the server down,
 * and the Host header — attacker-controlled and not necessarily a valid
 * authority — is never consulted: the base is a fixed constant and we route on
 * the path alone.
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
  // No body-parsing middleware is mounted, so the request stream is untouched
  // and the transport reads it itself — same as the pre-express handler did.
  await transport.handleRequest(req, res);
}

/**
 * Mount order is the contract, not a detail:
 *   1. unparseable-target guard (400 before anything tries to route),
 *   2. RFC 9728 protected-resource metadata (+ the RFC 8414 authorization-server
 *      mirror the SDK adds) — must be reachable unauthenticated, since it is
 *      literally what a 401 tells the client to go and fetch,
 *   3. GET /health — stays unauthenticated (liveness probes and the launchd
 *      health check have no token),
 *   4. requireBearerAuth on /mcp ONLY, then the MCP handler behind it,
 *   5. 404 for everything else, then the error handler last.
 */
function buildApp(auth: RemoteAuth): ExpressApp {
  const app = express() as ExpressApp;

  const rejectUnparseableTarget: ExpressHandler = (req, res, next) => {
    if (requestPath(req) === null) {
      sendJsonRpcError(res, 400, -32600, 'Invalid request target');
      return;
    }
    next();
  };

  const health: ExpressHandler = (_req, res) => {
    sendJson(res, 200, { name: 'r2mcp', version: SERVER_VERSION, scope: CURRENT_SCOPE });
  };

  // Stateless mode has no standalone SSE stream to open and no session to
  // terminate, so GET and DELETE are unsupported on /mcp (SDK stateless
  // example); /health only answers GET and HEAD.
  const methodNotAllowed: ExpressHandler = (_req, res) => {
    sendJsonRpcError(res, 405, -32000, 'Method not allowed.');
  };

  const mcpPost: ExpressHandler = (req, res) => {
    handleMcpPost(req, res).catch((err) => {
      console.error('[r2mcp-remote] error handling POST /mcp:', err);
      sendJsonRpcError(res, 500, -32603, 'Internal server error');
    });
  };

  const notFound: ExpressHandler = (_req, res) => {
    sendJsonRpcError(res, 404, -32601, 'Not found');
  };

  const onError: ExpressErrorHandler = (err, _req, res, _next) => {
    console.error('[r2mcp-remote] unhandled request error:', err);
    sendJsonRpcError(res, 500, -32603, 'Internal server error');
  };

  app.use(rejectUnparseableTarget);

  // The SDK owns the shape of both metadata documents. `authorization_servers`
  // is populated from the AS's own published `issuer`, so pointing
  // R2MCP_OAUTH_ISSUER at a different, spec-compliant AS is the entire
  // migration.
  app.use(
    mcpAuthMetadataRouter({
      oauthMetadata: auth.oauthMetadata,
      resourceServerUrl: auth.resourceServerUrl,
      resourceName: 'r2mcp',
    }),
  );

  app.get('/health', health);
  app.all('/health', methodNotAllowed);

  // The 401 + `WWW-Authenticate: Bearer …, resource_metadata="…"` contract is
  // the SDK's, not ours — see bearerAuth.js's buildWwwAuthHeader. We hand it
  // the resource-metadata URL and a verifier and set no auth headers by hand.
  app.use(
    '/mcp',
    requireBearerAuth({
      verifier: auth.verifier,
      resourceMetadataUrl: auth.resourceMetadataUrl,
    }),
  );
  app.post('/mcp', mcpPost);
  app.all('/mcp', methodNotAllowed);

  app.use(notFound);
  app.use(onError);

  return app;
}

/**
 * HTTP lifecycle, NOT stdio lifecycle: wireParentDisconnectHandlers() from
 * src/index.ts is deliberately absent — there is no parent pipe here, and
 * exiting on stdin EOF would kill a launchd-managed service the moment its
 * stdin closed. Signals are the only shutdown path.
 */
let httpServer: Server | null = null;
let shuttingDown = false;
async function shutdown(signal: string): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;
  console.error(`[r2mcp-remote] ${signal} received — shutting down`);
  const server = httpServer;
  if (server) {
    // Don't let a lingering keep-alive connection hold the process open.
    server.closeAllConnections();
    await new Promise<void>((done) => server.close(() => done()));
  }
  await closeDb();
  process.exit(0);
}

process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));

async function main(): Promise<void> {
  // Resource-server auth is resolved FIRST: a server that cannot verify tokens
  // must never open a socket, and this is the cheaper of the two startup
  // dependencies to fail on (no DB pool to unwind).
  let auth: RemoteAuth;
  try {
    auth = await createRemoteAuth({ issuer: OAUTH_ISSUER, audience: OAUTH_AUDIENCE });
  } catch (err) {
    console.error(
      `[r2mcp-remote] refusing to start: could not initialise OAuth resource-server auth ` +
        `(R2MCP_OAUTH_ISSUER=${JSON.stringify(OAUTH_ISSUER)}, ` +
        `R2MCP_OAUTH_AUDIENCE=${JSON.stringify(OAUTH_AUDIENCE)}): ` +
        (err instanceof Error ? err.message : String(err)),
    );
    process.exit(1);
  }

  await initDb();
  console.error(`[r2mcp-remote] project scope: ${CURRENT_SCOPE}`);
  console.error(
    `[r2mcp-remote] auth: bearer tokens issued by ${OAUTH_ISSUER}, audience ${OAUTH_AUDIENCE}`,
  );

  const server = createServer(buildApp(auth));
  httpServer = server;
  await new Promise<void>((listening) => server.listen(PORT, HOST, listening));
  // Report the port the OS actually gave us, not the requested constant — with
  // PORT=0 (ephemeral) the requested value tells an operator nothing.
  const address = server.address();
  const boundPort = address && typeof address === 'object' ? address.port : PORT;
  console.error(
    `[r2mcp-remote] r2mcp ${SERVER_VERSION} on http://${HOST}:${boundPort} (POST /mcp, GET /health)`,
  );
}

main().catch((err) => {
  console.error('[r2mcp-remote] fatal error:', err);
  process.exit(1);
});
