// SPEC-047 Phase 5 — MCP response shaping.
//
// Centralises JSON-stringify + breadcrumb wrapping for every server.tool() handler.
// Lives in its own module (not src/index.ts) so test files can import asMcpResponse
// without triggering the MCP server's main() and DB init.

import { withBreadcrumbs, type ToolName, type BreadcrumbContext } from './breadcrumbs.js';

export function asMcpResponse<T extends object>(toolName: ToolName, result: T, args: unknown) {
  const ctx = { tool: toolName, response: result as never, args } as BreadcrumbContext;
  const wrapped = withBreadcrumbs(result, ctx);
  // Compact serialization (claw-ohhj.3): agents pay for every response token
  // in every session; pretty-print indentation was ~30% of the payload.
  return {
    content: [{ type: 'text' as const, text: JSON.stringify(wrapped) }],
  };
}
