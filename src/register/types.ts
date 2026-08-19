// SPEC-059 — shared registration context types.
//
// Each src/register/<tool>.ts exports a register<Tool>(server, ctx) function
// holding the server.tool() block that used to live inline in src/index.ts.
// Entry points compose exactly the subset they import: src/index.ts registers
// all eleven tools, while the remote profile (SPEC-059) registers only the
// five safe ones. Keeping ToolContext minimal is what makes that possible —
// the remote profile must never be forced to supply a projectRoot.

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

export interface ToolContext {
  /** Project scope, resolved once by the entry point (claw-nyxd). */
  scope: string;
  /** Profile-specific description override; omitted = the stdio text. */
  description?: string;
}

export interface RememberContext extends ToolContext {
  /**
   * Fired after a write that changed the store. stdio wires the graph rebuild
   * here; the remote profile wires nothing (it has no PROJECT_ROOT and must
   * not reach node:child_process).
   */
  afterWrite?: () => void;
}

/**
 * Context for the registrations that shell out to CLI drivers or write files
 * under the project root. These tools are stdio-only by construction.
 */
export interface ProjectToolContext extends ToolContext {
  projectRoot: string;
}

export type Register = (server: McpServer, ctx: ToolContext) => void;
