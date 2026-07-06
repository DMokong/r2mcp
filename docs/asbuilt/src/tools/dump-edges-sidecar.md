---
type: Module
title: src/tools/dump-edges-sidecar.ts
description: Skeleton concept for src/tools/dump-edges-sidecar.ts (extracted; 5 symbols).
resource: src/tools/dump-edges-sidecar.ts
tags:
  - src
  - module
  - function
  - interface
enrichment: accuracy-audited
from:
  - BACKFILL-r2mcp-03
explains:
  - src/tools/dump-edges-sidecar.ts#DumpEdgesInput
  - src/tools/dump-edges-sidecar.ts#DumpEdgesOutput
  - src/tools/dump-edges-sidecar.ts#dumpEdgesJson
  - src/tools/dump-edges-sidecar.ts#dumpEdgesJsonWithClient
  - src/tools/dump-edges-sidecar.ts#dumpEdgesSidecarTool
stale: false
stale_reason: ""
graph_hash: c192643d124600fd68491305707bec2b09c19febe0921e729af00e7c9e27905f
---

# Structure

## Exports
- `DumpEdgesInput` (interface, lines 16-19)
- `DumpEdgesOutput` (interface, lines 21-25)
- `dumpEdgesJson` (function, lines 93-103)
- `dumpEdgesJsonWithClient` (function, lines 32-87)
- `dumpEdgesSidecarTool` (function, lines 109-114)

## Symbols
| Symbol | Kind | Span | Exported |
|---|---|---|---|
| `DumpEdgesInput` | interface | 16-19 | yes |
| `DumpEdgesOutput` | interface | 21-25 | yes |
| `dumpEdgesJson` | function | 93-103 | yes |
| `dumpEdgesJsonWithClient` | function | 32-87 | yes |
| `dumpEdgesSidecarTool` | function | 109-114 | yes |

## Calls out
- `dumpEdgesJson` → `dumpEdgesJsonWithClient` (same file)
- `dumpEdgesSidecarTool` → `dumpEdgesJson` (same file)

## Called by
- `main` in [src/cli/dump-edges-json.ts](/src/cli/dump-edges-json.md)

# Explanation
This SPEC-045 module is the sidecar JSON exporter that feeds the Memory Explorer UI: it dumps the live `memory_edges` and `memories` tables to `edges.json`/`memories.json` files under a caller-supplied `out_dir`. Unlike the LLM-backed tools (classify/compile/extract-entities), it runs entirely in-process against pgvector — no subprocess, because a synchronous DB read/dump involves no LLM call and doesn't trigger the constraint those other tools work around.

# Decisions
- (BACKFILL-r2mcp-03) `dumpEdgesJsonWithClient` is deliberately split out as a pure function taking an already-connected `pg.Client`, purely so tests can inject a fake client without needing to manage a real connection's open/close lifecycle; `dumpEdgesJson` is the production convenience wrapper that owns that lifecycle (opens from `R2MCP_DATABASE_URL`, always closes in `finally`). Neither SQL query filters by `project_scope` — a deliberate departure (as far as can be told without cross-checking the spec) from the scope-isolation pattern in search/reject/meditate/lint, because this tool's job is a full operator-facing export/backup, not a per-project read path; a future reader adding scope-awareness elsewhere in the codebase should decide explicitly whether this tool needs the same treatment rather than assuming it already has it. The output file names and envelope shape (`generated_at`, `memory_count`/`edge_count`, then the rows) are a fixed contract — the caller only controls `out_dir` — because a downstream consumer (the Memory Explorer UI, per the file's own header comment) parses these files by that shape.

# Citations
[1] BACKFILL-r2mcp-03 evidence: /Users/dustincheng/projects/claudeclaw/docs/specs/asbuilt-living-kb/evidence/backfill03-evidence.yml
