---
type: Module
title: src/tools/classify.ts
description: Skeleton concept for src/tools/classify.ts (extracted; 8 symbols).
resource: src/tools/classify.ts
tags:
  - src
  - module
  - const
  - function
  - interface
enrichment: accuracy-audited
from:
  - BACKFILL-r2mcp-03
explains:
  - src/tools/classify.ts#ClassifySummary
  - src/tools/classify.ts#ClassifyToolInput
  - src/tools/classify.ts#buildArgs
  - src/tools/classify.ts#classify
  - src/tools/classify.ts#parseSummary
  - src/tools/classify.ts#runSubprocess
  - src/tools/classify.ts#settle
stale: false
stale_reason: ""
graph_hash: 722abd60fe9a14221204daed15ffc79c1ccb916aa2f11bc37b8d327971cb1d46
---

# Structure

## Exports
- `ClassifySummary` (interface, lines 27-41)
- `ClassifyToolDeps` (interface, lines 43-47)
- `ClassifyToolInput` (interface, lines 14-25)
- `classify` (function, lines 49-61)

## Symbols
| Symbol | Kind | Span | Exported |
|---|---|---|---|
| `ClassifySummary` | interface | 27-41 | yes |
| `ClassifyToolDeps` | interface | 43-47 | yes |
| `ClassifyToolInput` | interface | 14-25 | yes |
| `buildArgs` | function | 63-71 | no |
| `classify` | function | 49-61 | yes |
| `parseSummary` | function | 120-166 | no |
| `runSubprocess` | function | 73-118 | no |
| `settle` | const | 85-89 | no |

## Calls out
- `classify` → `buildArgs` (same file)
- `classify` → `parseSummary` (same file)
- `classify` → [resolveCliCommand](/src/tools/spawn-cli.md)
- `classify` → `runSubprocess` (same file)
- `runSubprocess` → `settle` (same file)

# Explanation
classify() is the MCP-facing entry point for SPEC-043's two-stage (Haiku filter, then Opus classify) edge-classification pipeline, which links related memories with typed edges (contradicts, supersedes, elaborates, etc.). It is a thin subprocess wrapper by design, not by accident: SPEC-044 forbids the long-running MCP server process from making LLM calls itself, so classify() only marshals arguments, manages subprocess lifecycle, and parses the result — the real classification work (and the provider credentials/config it needs) lives entirely in the standalone `classify-edges` CLI driver.

# Decisions
- (BACKFILL-r2mcp-03) resolveCliCommand (spawn-cli.ts) is the single place that knows dev-vs-prod invocation (tsx+.ts vs node+dist/.js); classify.ts itself never branches on environment. The default 30-minute subprocess timeout exists because a full, cost-capped classify run walks every candidate pair through two LLM stages and can legitimately take a while; it's injectable via `deps.runTimeoutMs` specifically so tests don't have to wait out a real timeout. The `settle()` once-only guard exists because the timer's SIGKILL path and the child's own `exit` event can both fire in close succession once a process is killed — without the guard, a timeout rejection could be silently overwritten by a late exit-resolve (or vice versa). This exact pattern (settle guard + brace-matching JSON parser) is copy-pasted near-verbatim into extract-entities.ts, and the parse strategy is shared conceptually with compile.ts too — the in-file comments cross-reference each other, so a change to the subprocess's terminal-JSON convention (walking backward from the last `}` with string-aware brace matching, because the CLI may print progress output that is itself JSON-shaped before the real summary) should be propagated to all three files, not just one.

# Citations
[1] BACKFILL-r2mcp-03 evidence: /Users/dustincheng/projects/claudeclaw/docs/specs/asbuilt-living-kb/evidence/backfill03-evidence.yml
