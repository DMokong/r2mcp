---
type: Module
title: src/index.ts
description: Skeleton concept for src/index.ts (extracted; 3 symbols).
resource: src/index.ts
tags:
  - src
  - module
  - const
  - function
enrichment: accuracy-audited
from:
  - BACKFILL-r2mcp-02
explains:
  - src/index.ts#exit
  - src/index.ts#main
  - src/index.ts#wireParentDisconnectHandlers
stale: false
stale_reason: ""
graph_hash: c192643d124600fd68491305707bec2b09c19febe0921e729af00e7c9e27905f
---

# Structure

## Symbols
| Symbol | Kind | Span | Exported |
|---|---|---|---|
| `exit` | const | 555-558 | no |
| `main` | function | 566-576 | no |
| `wireParentDisconnectHandlers` | function | 554-564 | no |

## Calls out
- `exit` → `exit` (same file)
- `main` → [initDb](/src/db.md)
- `main` → `wireParentDisconnectHandlers` (same file)
- `wireParentDisconnectHandlers` → `exit` (same file)

# Explanation
This is the r2mcp MCP server process entrypoint — the executable an MCP client (Claude Code, the Slack bot, etc.) spawns over stdio. It wires up an `@modelcontextprotocol/sdk` `McpServer` instance, registers all 11 tools the memory system exposes (remember, recall, search, stats, reject, meditate, compile, classify, extract_entities, dump_edges_sidecar, lint), loads `.env` manually (MCP subprocesses don't inherit parent shell env), resolves the project's scope once at boot, and connects a `StdioServerTransport`. A future reader should treat this file as pure wiring/composition — the substantive logic for each tool lives in `src/tools/*.ts`; index.ts's own job is zod schema declaration, telemetry span wrapping (`withToolSpan`), response shaping (`asMcpResponse`), and process lifecycle.

# Decisions
- (BACKFILL-r2mcp-02) OTel instrumentation is imported as the literal first line (`import './instrumentation.js'`), before even `node:path` — OTel's auto-instrumentation patches modules (e.g. `pg`, `http`) at import time, so importing it even one statement later would miss spans on anything already imported before it. `CURRENT_SCOPE` is resolved once at module load, right after `.env` loads — scope is meant to be static per-server-process config (`R2MCP_SCOPE`), and tools that read/write memory default to it while still allowing an explicit per-call `scope` override (e.g. reading a different project's wiki corpus without restarting the server). `wireParentDisconnectHandlers` exists because stdio transport gives no clean signal when the owning client dies via force-quit or a dropped SSH session — it listens for BOTH `stdin` `end`/`close` (EOF) and `stdout` `EPIPE` because either side can notice the disconnect first; without it, a dead parent leaves the process (and its held Postgres connection slot) running forever. `export { asMcpResponse }` from this file is a deliberate backwards-compat shim for anything that imported it from `src/index.js` before SPEC-047 split it into `src/mcp-response.ts` — new code should import from `mcp-response.ts` directly. Finally: the graph extractor only names 3 symbols in this file (`exit`, `main`, `wireParentDisconnectHandlers`) because the 11 `server.tool(...)` registrations are anonymous inline handlers, not top-level declarations — a future reader relying on the call graph for this file will need to read the source directly to see per-tool argument schemas and dispatch; they are not individually graphed.

# Citations
[1] BACKFILL-r2mcp-02 evidence: /Users/dustincheng/projects/claudeclaw/docs/specs/asbuilt-living-kb/evidence/backfill02-evidence.yml
