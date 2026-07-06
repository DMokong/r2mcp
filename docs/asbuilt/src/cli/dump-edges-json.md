---
type: Module
title: src/cli/dump-edges-json.ts
description: Skeleton concept for src/cli/dump-edges-json.ts (extracted; 1 symbols).
resource: src/cli/dump-edges-json.ts
tags:
  - src
  - module
  - function
enrichment: accuracy-audited
from:
  - BACKFILL-r2mcp-04
explains:
  - src/cli/dump-edges-json.ts#main
stale: false
stale_reason: ""
graph_hash: c192643d124600fd68491305707bec2b09c19febe0921e729af00e7c9e27905f
---

# Structure

## Symbols
| Symbol | Kind | Span | Exported |
|---|---|---|---|
| `main` | function | 21-28 | no |

## Calls out
- `main` → [dumpEdgesJson](/src/tools/dump-edges-sidecar.md)

# Explanation
A legacy-shaped dev convenience script that exists alongside a newer, better-integrated way of doing the same thing: the `dump_edges_sidecar` MCP tool calls the exact same underlying function (`dumpEdgesJson`/`dumpEdgesJsonWithClient` in src/tools/dump-edges-sidecar.ts) in-process from within a live MCP session. A future reader should not be surprised that this file is nearly empty — that's the point; all the actual logic (SQL, JSON shape, output file naming) lives in the SPEC-045 sidecar module, and this file is purely 'run it from a plain terminal without an MCP client attached'.

# Decisions
- (BACKFILL-r2mcp-04) This script is explicitly documented as NOT the production path — the header comment tells readers to use the MCP tool instead, and this file is kept alive only for the dev workflow (`tsx scripts/dump-edges-json.ts --out-dir=...`) where no MCP client is running at all, e.g. local debugging or a one-off manual export. It has no `--scope` flag and no OTel span wrapping unlike its CLI siblings in this directory, because the underlying `dumpEdgesJsonWithClient` query itself has no scope filter (it dumps ALL memories where `type != 'archived'`, across every project scope) — a future reader adding scope filtering to the sidecar function would need to thread a `--scope` flag through this CLI too, and should not assume scope isolation is already enforced here the way it is in compile-wiki.ts or classify-edges.ts.

# Citations
[1] BACKFILL-r2mcp-04 evidence: /Users/dustincheng/projects/claudeclaw/docs/specs/asbuilt-living-kb/evidence/backfill04-evidence.yml
