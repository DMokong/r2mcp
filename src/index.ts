#!/usr/bin/env node
// OTel instrumentation MUST be imported first — before any other module
import './instrumentation.js';

import { resolve } from 'node:path';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { initDb } from './db.js';
import { loadEnvFile, currentScope } from './env.js';
import { SERVER_INSTRUCTIONS } from './server-instructions.js';
import { EMBEDDINGS_DISABLED_WARNING } from './embeddings.js';
import { asMcpResponse } from './mcp-response.js';
import { triggerGraphRebuild } from './graph-rebuild.js';
import { SERVER_VERSION } from './register/version.js';
import { registerRemember } from './register/remember.js';
import { registerRecall } from './register/recall.js';
import { registerSearch } from './register/search.js';
import { registerStats } from './register/stats.js';
import { registerReject } from './register/reject.js';
import { registerMeditate } from './register/meditate.js';
import { registerCompile } from './register/compile.js';
import { registerClassify } from './register/classify.js';
import { registerExtractEntities } from './register/extract-entities.js';
import { registerDumpEdgesSidecar } from './register/dump-edges-sidecar.js';
import { registerLint } from './register/lint.js';

// Re-export for backwards compatibility with anything that imported asMcpResponse
// from src/index.js before SPEC-047's mcp-response.ts split. New callers should
// import directly from './mcp-response.js'.
export { asMcpResponse };

// Load .env from project root — MCP servers don't inherit parent env vars
const PROJECT_ROOT = process.env.PROJECT_ROOT || process.cwd();
loadEnvFile(resolve(PROJECT_ROOT, '.env'));

// claw-nyxd: resolve the project scope once at startup (after .env load).
const CURRENT_SCOPE = currentScope();

const server = new McpServer(
  {
    name: 'r2mcp',
    version: SERVER_VERSION,
  },
  // Sent in the initialize response; Claude Code loads this into the agent's
  // context at session start (claw-8cjf.8 — first-session guidance).
  { instructions: SERVER_INSTRUCTIONS },
);

// SPEC-059: the eleven tool registrations moved to src/register/*.ts so a
// second entry point (the remote profile) can compose a subset. This entry
// point is the full stdio surface and registers all of them.
registerRemember(server, {
  scope: CURRENT_SCOPE,
  // Pre-SPEC-059 this rebuild fired from inside src/tools/remember.ts. It is
  // wired here so the remote profile — which has no project root and must not
  // reach node:child_process — simply omits it.
  afterWrite: () => triggerGraphRebuild(PROJECT_ROOT),
});
registerRecall(server, { scope: CURRENT_SCOPE });
registerSearch(server, { scope: CURRENT_SCOPE });
registerStats(server, { scope: CURRENT_SCOPE });
registerReject(server, { scope: CURRENT_SCOPE });
registerMeditate(server, { scope: CURRENT_SCOPE, projectRoot: PROJECT_ROOT });
registerCompile(server, { scope: CURRENT_SCOPE, projectRoot: PROJECT_ROOT });
registerClassify(server, { scope: CURRENT_SCOPE, projectRoot: PROJECT_ROOT });
registerExtractEntities(server, { scope: CURRENT_SCOPE, projectRoot: PROJECT_ROOT });
registerDumpEdgesSidecar(server, { scope: CURRENT_SCOPE });
registerLint(server, { scope: CURRENT_SCOPE });

/**
 * Exit when the parent client disconnects.
 *
 * MCP transport is stdio — the parent (Claude Code, Slack bot, etc.) owns
 * this subprocess via a private pipe. When the parent exits cleanly it
 * sends SIGTERM and we never reach this path. When the parent crashes
 * (force-quit, SSH disconnect, kernel OOM), the pipe closes silently and
 * we'd otherwise sit forever waiting for input that never comes —
 * holding a Postgres connection slot for nothing.
 *
 * Watching `stdin` for `end` (EOF) catches both clean and crashed parents.
 * Watching `stdout` for EPIPE covers the rarer "we tried to write back
 * after the parent disappeared" case.
 */
function wireParentDisconnectHandlers(): void {
  const exit = (reason: string) => {
    console.error(`r2mcp exiting: ${reason}`);
    process.exit(0);
  };
  process.stdin.on('end', () => exit('parent disconnected (stdin EOF)'));
  process.stdin.on('close', () => exit('parent disconnected (stdin closed)'));
  process.stdout.on('error', (err: NodeJS.ErrnoException) => {
    if (err.code === 'EPIPE') exit('parent disconnected (stdout EPIPE)');
  });
}

async function main() {
  await initDb();
  console.error(`[r2mcp] project scope: ${CURRENT_SCOPE}`);
  if (!process.env.R2MCP_OPENROUTER_API_KEY) {
    console.error(`[r2mcp] ${EMBEDDINGS_DISABLED_WARNING}`);
  }
  const transport = new StdioServerTransport();
  await server.connect(transport);
  wireParentDisconnectHandlers();
  console.error('r2mcp running on stdio');
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
