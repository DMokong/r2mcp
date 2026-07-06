---
type: Module
title: src/graph-rebuild.ts
description: Skeleton concept for src/graph-rebuild.ts (extracted; 1 symbols).
resource: src/graph-rebuild.ts
tags:
  - src
  - module
  - function
enrichment: accuracy-audited
from:
  - BACKFILL-r2mcp-10
explains:
  - src/graph-rebuild.ts#triggerGraphRebuild
stale: false
stale_reason: ""
graph_hash: c192643d124600fd68491305707bec2b09c19febe0921e729af00e7c9e27905f
---

# Structure

## Exports
- `triggerGraphRebuild` (function, lines 12-22)

## Symbols
| Symbol | Kind | Span | Exported |
|---|---|---|---|
| `triggerGraphRebuild` | function | 12-22 | yes |

## Called by
- `meditate` in [src/tools/meditate.ts](/src/tools/meditate.md)
- `remember` in [src/tools/remember.ts](/src/tools/remember.md)

# Explanation
Best-effort hook letting a downstream consumer of r2mcp (specifically, ClaudeClaw's own memory graph visualizer) regenerate its cached graph whenever `remember` or `meditate` mutate the memories table. r2mcp itself doesn't ship or depend on `scripts/build-memory-graph.js` — the hook is entirely optional and checked for at runtime.

# Decisions
- (BACKFILL-r2mcp-10) Presence is checked via `existsSync` rather than gated by an explicit feature flag — this is a deliberately low-ceremony extension point: any consuming project can drop a `scripts/build-memory-graph.js` into its project root and it "just works" with no r2mcp-side configuration. Absence is silent by design, since most r2mcp installations will never have this script and shouldn't see a warning about a feature they never opted into. The rebuild is fire-and-forget: `execFile` is not awaited by any caller, and even its own completion callback only logs via `console.error` rather than propagating the error — a broken or missing graph rebuild script must never fail a `remember`/`meditate` call, since the memory write it follows already succeeded and is the operation the caller actually cares about. The 30-second timeout is a safety valve against a runaway or hung rebuild script keeping the Node process alive after the tool call has otherwise finished. This is the one place in r2mcp that shells out to an external, non-bundled script on the host — worth remembering when auditing what r2mcp can execute.

# Citations
[1] BACKFILL-r2mcp-10 evidence: /Users/dustincheng/projects/claudeclaw/docs/specs/asbuilt-living-kb/evidence/backfill10-evidence.yml
