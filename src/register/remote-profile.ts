// SPEC-059 (R2/R4/AC1/AC2) — the remote tool profile.
//
// This module is the whole of the remote surface: five safe tools, composed by
// import. The enforcement for the excluded six (meditate, compile, lint,
// classify, extract_entities, dump_edges_sidecar) is structural — this file
// simply never imports them, so nothing downstream of src/remote.ts can reach
// their modules, their CLI spawners, or node:child_process. That is deliberately
// NOT an env-var gate: one misset variable must not be able to expose
// file-write and process-spawn to the internet.
//
// tests/remote-profile.test.ts walks the import graph from src/remote.ts on
// every run and fails if that property ever regresses.

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { registerRecall } from './recall.js';
import { registerRemember } from './remember.js';
import { registerSearch } from './search.js';
import { registerStats } from './stats.js';
import { registerReject } from './reject.js';
import {
  RECALL_DESCRIPTION,
  REMEMBER_DESCRIPTION,
  SEARCH_DESCRIPTION,
  STATS_DESCRIPTION,
  REJECT_DESCRIPTION,
} from './remote-descriptions.js';
import type { ToolContext } from './types.js';

/**
 * Registers exactly `recall`, `remember`, `search`, `stats`, `reject` with the
 * §6 ambient-invocation descriptions. Schemas and handlers are the same code
 * stdio runs (R1's anti-drift guarantee) — only the descriptions differ.
 *
 * `ctx` is a plain ToolContext, not a RememberContext: registerRemember is
 * therefore called with **no `afterWrite`**, so a remote write can never fire
 * the graph rebuild (R4/AC5). The type makes it impossible for a caller to
 * thread one in.
 */
export function registerRemoteProfile(server: McpServer, ctx: ToolContext): void {
  registerRecall(server, { scope: ctx.scope, description: RECALL_DESCRIPTION });
  registerRemember(server, { scope: ctx.scope, description: REMEMBER_DESCRIPTION });
  registerSearch(server, { scope: ctx.scope, description: SEARCH_DESCRIPTION });
  registerStats(server, { scope: ctx.scope, description: STATS_DESCRIPTION });
  registerReject(server, { scope: ctx.scope, description: REJECT_DESCRIPTION });
}
