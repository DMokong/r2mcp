---
type: Module
title: src/tools/extract-entities.ts
description: Skeleton concept for src/tools/extract-entities.ts (extracted; 9 symbols).
resource: src/tools/extract-entities.ts
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
  - src/tools/extract-entities.ts#ExtractEntitiesInput
  - src/tools/extract-entities.ts#buildArgs
  - src/tools/extract-entities.ts#currentTraceparent
  - src/tools/extract-entities.ts#extractEntitiesTool
  - src/tools/extract-entities.ts#parseSummary
  - src/tools/extract-entities.ts#runSubprocess
  - src/tools/extract-entities.ts#settle
  - src/tools/extract-entities.ts#validateInput
stale: false
stale_reason: ""
graph_hash: c192643d124600fd68491305707bec2b09c19febe0921e729af00e7c9e27905f
---

# Structure

## Exports
- `ExtractEntitiesInput` (interface, lines 42-55)
- `ExtractEntitiesToolDeps` (interface, lines 57-64)
- `currentTraceparent` (function, lines 33-40)
- `extractEntitiesTool` (function, lines 66-87)

## Symbols
| Symbol | Kind | Span | Exported |
|---|---|---|---|
| `ExtractEntitiesInput` | interface | 42-55 | yes |
| `ExtractEntitiesToolDeps` | interface | 57-64 | yes |
| `buildArgs` | function | 95-104 | no |
| `currentTraceparent` | function | 33-40 | yes |
| `extractEntitiesTool` | function | 66-87 | yes |
| `parseSummary` | function | 165-211 | no |
| `runSubprocess` | function | 106-163 | no |
| `settle` | const | 130-134 | no |
| `validateInput` | function | 89-93 | no |

## Calls out
- `extractEntitiesTool` → `buildArgs` (same file)
- `extractEntitiesTool` → `currentTraceparent` (same file)
- `extractEntitiesTool` → `parseSummary` (same file)
- `extractEntitiesTool` → [resolveCliCommand](/src/tools/spawn-cli.md)
- `extractEntitiesTool` → `runSubprocess` (same file)
- `extractEntitiesTool` → `validateInput` (same file)
- `runSubprocess` → `settle` (same file)

# Explanation
extractEntitiesTool() is SPEC-046 Task 8's MCP entry point for the entity-extraction pipeline (pulling named entities out of memory content via LLM), and the file's own header comment says it deliberately mirrors classify.ts's shape: same subprocess-delegation pattern for the same SPEC-044 reason, same dependency-injection seams (spawnFn/cwd/runTimeoutMs), same settled-flag timeout guard, same trailing brace-matching JSON parse.

# Decisions
- (BACKFILL-r2mcp-03) The one genuinely new piece versus classify.ts/compile.ts is `currentTraceparent()`, which reads the currently active OpenTelemetry span (if the SDK is initialized) and hand-builds a W3C `traceparent` header string, passed to the child process via an `OTEL_TRACEPARENT` env var so the subprocess's spans nest under the parent MCP tool-call span instead of starting an orphaned trace (see the `claw-2jbo` finding referenced in the source comments, and the corresponding read site in `src/cli/extract-entities.ts`'s startup, which uses `propagation.extract()` to rebuild the context). When there's no active span, `currentTraceparent()` returns `undefined` and the child env falls back to unmodified `process.env` — this degrades gracefully rather than throwing. Neither classify.ts nor compile.ts propagate a traceparent to their own subprocesses; a future reader should not assume trace-context propagation exists uniformly across all three subprocess-spawning tools — today it's only wired for extract-entities. `validateInput()`'s `full`/`since_days` mutual-exclusion check is also unique to this file among the three; compile.ts validates differently (an exactly-one-of-three-fields count), and classify.ts doesn't cross-validate its flags at all.

# Citations
[1] BACKFILL-r2mcp-03 evidence: /Users/dustincheng/projects/claudeclaw/docs/specs/asbuilt-living-kb/evidence/backfill03-evidence.yml
