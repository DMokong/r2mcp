---
type: Module
title: src/compiler/run.ts
description: Skeleton concept for src/compiler/run.ts (extracted; 6 symbols).
resource: src/compiler/run.ts
tags:
  - src
  - module
  - function
  - interface
enrichment: accuracy-audited
from:
  - BACKFILL-r2mcp-02
explains:
  - src/compiler/run.ts#mergeManifest
  - src/compiler/run.ts#runCompile
  - src/compiler/run.ts#validateOptions
stale: false
stale_reason: ""
graph_hash: c192643d124600fd68491305707bec2b09c19febe0921e729af00e7c9e27905f
---

# Structure

## Exports
- `CompileFs` (interface, lines 64-71)
- `RunCompileDeps` (interface, lines 48-62)
- `RunCompileOptions` (interface, lines 29-46)
- `runCompile` (function, lines 82-217)

## Symbols
| Symbol | Kind | Span | Exported |
|---|---|---|---|
| `CompileFs` | interface | 64-71 | yes |
| `RunCompileDeps` | interface | 48-62 | yes |
| `RunCompileOptions` | interface | 29-46 | yes |
| `mergeManifest` | function | 231-252 | no |
| `runCompile` | function | 82-217 | yes |
| `validateOptions` | function | 219-224 | no |

## Calls out
- `runCompile` → [compileTier](/src/compiler/tier.md)
- `runCompile` → [compileTopic](/src/compiler/topic.md)
- `runCompile` → [computeStaleFiles](/src/compiler/manifest.md)
- `runCompile` → [emitFrontmatter](/src/compiler/frontmatter.md)
- `runCompile` → [manifestPath](/src/compiler/manifest.md)
- `runCompile` → `mergeManifest` (same file)
- `runCompile` → [topicToSlug](/src/compiler/clustering.md)
- `runCompile` → `validateOptions` (same file)

## Called by
- `main` in [src/cli/compile-wiki.ts](/src/cli/compile-wiki.md)

# Explanation
compiler/run.ts is the orchestration layer behind the `compile` MCP tool's actual work: regenerating `memory/compiled/*.md`, the human-browsable "wiki view" synthesized from pgvector by an LLM. It is designed to run OUTSIDE the MCP server process — `src/tools/compile.ts` (the MCP handler) spawns a separate `compile-wiki` CLI subprocess that calls `runCompile()`, because the system requires the MCP server process itself to make zero LLM calls; all provider calls happen in that subprocess, even though `runCompile()` itself is provider-agnostic and has no idea whether it's being invoked from the CLI or a test harness.

# Decisions
- (BACKFILL-r2mcp-02) `RunCompileDeps` is fully dependency-injected (`loadMemories`, `provider`, and even `fs`/`stdout` test seams) specifically so the entire compile flow — including manifest merge and stale-file cleanup — can be exercised in tests without a live Postgres connection or a live LLM call; `realFs` is the only production implementation and is trivial to swap out. The tier loop and the topic branch share ONE `costMeter` object rather than two separate budgets, so a combined invocation would enforce a single cumulative cost cap instead of double-spending — forward-looking headroom in the cost-accounting shape, even though `validateOptions()` today enforces exactly one of `{tier, all, topic}` so no single `runCompile()` call actually exercises both loops at once. `mergeManifest()` exists because a scoped compile (e.g. `compile({tier: 'preferences'})`) must NOT wipe manifest entries — and therefore delete the corresponding files via `computeStaleFiles()` — for tiers or topics untouched this run; without merging in the prior manifest's untouched entries first, every scoped compile would look to `computeStaleFiles()` like "everything except what I just wrote is now stale," deleting the other two tiers' pages on every single-tier compile. `dry_run` short-circuits BEFORE any manifest read/write or stale-cleanup logic runs at all (not just before the file write), so a preview invocation makes no filesystem assumptions and cannot accidentally delete real compiled output — manifest-merge/stale-delete is the one part of this file with side effects beyond "write these bytes to this path."

# Citations
[1] BACKFILL-r2mcp-02 evidence: /Users/dustincheng/projects/claudeclaw/docs/specs/asbuilt-living-kb/evidence/backfill02-evidence.yml
