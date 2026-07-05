---
type: Module
title: src/mcp-response.ts
description: Skeleton concept for src/mcp-response.ts (extracted; 1 symbols).
resource: src/mcp-response.ts
tags:
  - src
  - module
  - function
enrichment: accuracy-audited
from:
  - BACKFILL-r2mcp-02
explains:
  - src/mcp-response.ts#asMcpResponse
stale: false
stale_reason: ""
graph_hash: 722abd60fe9a14221204daed15ffc79c1ccb916aa2f11bc37b8d327971cb1d46
---

# Structure

## Exports
- `asMcpResponse` (function, lines 9-17)

## Symbols
| Symbol | Kind | Span | Exported |
|---|---|---|---|
| `asMcpResponse` | function | 9-17 | yes |

## Calls out
- `asMcpResponse` → [withBreadcrumbs](/src/breadcrumbs.md)

# Explanation
mcp-response.ts is a one-function module that exists purely as a seam: it's the single place every MCP tool handler's result passes through on the way out to the transport, and it was deliberately split out of `src/index.ts` (SPEC-047 Phase 5) so that unit tests exercising `asMcpResponse` (or the breadcrumb logic it wraps) don't transitively import `index.ts` and trigger its module-level side effects — `main()` being invoked, `initDb()` connecting to Postgres, `.env` being loaded — none of which a pure response-serialization unit test should need.

# Decisions
- (BACKFILL-r2mcp-02) The choice of compact `JSON.stringify(wrapped)` over a pretty-printed `JSON.stringify(wrapped, null, 2)` is a measured cost decision, not a style preference: indentation was measured at roughly 30% of the response payload, and every response token is billed to whichever agent (a Claude Code session, the Slack bot, etc.) reads the tool result — a fixed, recurring cost multiplied by call volume across every session, unlike a one-time development convenience. `asMcpResponse()` takes `args: unknown` and forwards it into the `BreadcrumbContext` untyped — the actual per-tool argument-shape narrowing happens inside breadcrumbs.ts's discriminated union keyed off `toolName`, not here; this file intentionally knows nothing about what any individual tool's arguments or response actually contain, keeping it a stable seam as new tools are added to the breadcrumb contract.

# Citations
[1] BACKFILL-r2mcp-02 evidence: /Users/dustincheng/projects/claudeclaw/docs/specs/asbuilt-living-kb/evidence/backfill02-evidence.yml
