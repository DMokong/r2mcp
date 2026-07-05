---
type: Module
title: src/tools/compile.ts
description: Skeleton concept for src/tools/compile.ts (extracted; 8 symbols).
resource: src/tools/compile.ts
tags:
  - src
  - module
  - function
  - interface
enrichment: accuracy-audited
from:
  - BACKFILL-r2mcp-03
explains:
  - src/tools/compile.ts#CompileToolInput
  - src/tools/compile.ts#buildArgs
  - src/tools/compile.ts#compile
  - src/tools/compile.ts#compileCliPath
  - src/tools/compile.ts#parseSummary
  - src/tools/compile.ts#runSubprocess
  - src/tools/compile.ts#validateInput
stale: false
stale_reason: ""
graph_hash: 722abd60fe9a14221204daed15ffc79c1ccb916aa2f11bc37b8d327971cb1d46
---

# Structure

## Exports
- `CompileToolDeps` (interface, lines 26-33)
- `CompileToolInput` (interface, lines 15-24)
- `compile` (function, lines 35-49)
- `compileCliPath` (function, lines 162-164)

## Symbols
| Symbol | Kind | Span | Exported |
|---|---|---|---|
| `CompileToolDeps` | interface | 26-33 | yes |
| `CompileToolInput` | interface | 15-24 | yes |
| `buildArgs` | function | 58-67 | no |
| `compile` | function | 35-49 | yes |
| `compileCliPath` | function | 162-164 | yes |
| `parseSummary` | function | 110-159 | no |
| `runSubprocess` | function | 69-108 | no |
| `validateInput` | function | 51-56 | no |

## Calls out
- `compile` → `buildArgs` (same file)
- `compile` → `parseSummary` (same file)
- `compile` → [resolveCliCommand](/src/tools/spawn-cli.md)
- `compile` → `runSubprocess` (same file)
- `compile` → `validateInput` (same file)

# Explanation
compile() is the MCP entry point for wiki compilation — turning raw tiered memories/topics into markdown documentation. Like classify.ts, it exists purely to satisfy SPEC-044's no-LLM-in-server-process rule by delegating the actual compilation (and its LLM calls) to the standalone `compile-wiki` CLI driver.

# Decisions
- (BACKFILL-r2mcp-03) `compileCliPath()` (a small exported helper returning `resolve(projectRoot, 'scripts/compile-wiki.ts')`) is dead/stale code: `scripts/compile-wiki.ts` does not exist anywhere in the repo — the actual driver lives at `src/cli/compile-wiki.ts` and is what `resolveCliCommand('compile-wiki')` resolves to at runtime. Nothing in src/ or tests/ calls `compileCliPath`. Treat it as a leftover from before `resolveCliCommand` existed rather than as documentation of where the driver actually lives — a future reader should trust `resolveCliCommand`'s dynamic resolution, not this function's hardcoded path. Separately, `runSubprocess` here uses a plain `timedOut` boolean checked inside the `exit` handler rather than classify.ts's/extract-entities.ts's explicit `settle()` once-guard — functionally similar (ordering prevents the double-settle race) but structured differently; don't assume the three subprocess-spawning tool handlers share one exact implementation, only the same overall pattern.

# Citations
[1] BACKFILL-r2mcp-03 evidence: /Users/dustincheng/projects/claudeclaw/docs/specs/asbuilt-living-kb/evidence/backfill03-evidence.yml
