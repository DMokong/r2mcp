---
type: Module
title: src/cli/extract-entities.ts
description: Skeleton concept for src/cli/extract-entities.ts (extracted; 7 symbols).
resource: src/cli/extract-entities.ts
tags:
  - src
  - module
  - class
  - const
  - function
  - interface
  - method
enrichment: accuracy-audited
from:
  - BACKFILL-r2mcp-04
explains:
  - src/cli/extract-entities.ts#CliArgs
  - src/cli/extract-entities.ts#UsageError
  - src/cli/extract-entities.ts#UsageError.constructor
  - src/cli/extract-entities.ts#main
  - src/cli/extract-entities.ts#parentContextFromEnv
  - src/cli/extract-entities.ts#parseArgs
  - src/cli/extract-entities.ts#runner
stale: false
stale_reason: ""
graph_hash: 722abd60fe9a14221204daed15ffc79c1ccb916aa2f11bc37b8d327971cb1d46
---

# Structure

## Exports
- `CliArgs` (interface, lines 67-75)
- `UsageError` (class, lines 81-88)
- `parseArgs` (function, lines 90-124)

## Symbols
| Symbol | Kind | Span | Exported |
|---|---|---|---|
| `CliArgs` | interface | 67-75 | yes |
| `UsageError` | class | 81-88 | yes |
| `UsageError.constructor` | method | 83-87 | yes |
| `main` | function | 126-150 | no |
| `parentContextFromEnv` | function | 56-65 | no |
| `parseArgs` | function | 90-124 | yes |
| `runner` | const | 168-180 | no |

## Calls out
- `main` → [closeDb](/src/db.md)
- `main` → [currentScope](/src/env.md)
- `main` → [getPool](/src/db.md)
- `main` → [initDb](/src/db.md)
- `main` → `parseArgs` (same file)
- `main` → [runExtractor](/src/entities/extractor.md)
- `main` → [selectProvider](/src/providers/index.ts.md)
- `main` → [RunSummaryWriter.write](/src/edges/state.md)
- `parseArgs` → [isProviderName](/src/providers/index.ts.md)
- `runner` → [exit](/src/index.ts.md)
- `runner` → `main` (same file)
- `runner` → [RunSummaryWriter.write](/src/edges/state.md)

# Explanation
The SPEC-046 entity-extraction CLI, structurally parallel to classify-edges.ts (same provider-selection precedence, same resume-by-run-id pattern, same cost-cap philosophy) but for a different pipeline: finding and linking named entities across memories rather than classifying relations between pairs of memories. A future reader debugging entity extraction should treat this file as wiring only — the substantive logic is in src/entities/extractor.ts, src/entities/prompt.ts, and src/entities/db.ts.

# Decisions
- (BACKFILL-r2mcp-04) `parentContextFromEnv` and the `context.with(parentCtx, runner)` wrapping exist for a specific, otherwise invisible failure mode: when the MCP server spawns this script as a subprocess to fulfill the `extract_entities` tool call, without this reconstruction step every span this subprocess emits would start a brand-new, disconnected OTel trace instead of nesting under the parent `memory.extract_entities` span — making the resulting traces useless for understanding 'which tool call caused this extraction run.' The reconstruction is deliberately best-effort: `propagation.extract` no-ops if no OTel propagator is registered (SDK not initialized) or if `OTEL_TRACEPARENT` was never set (e.g. a human running the CLI directly from a terminal), so the absence of a parent trace is silent, not an error. `UsageError` carrying its own `exitCode` (default 2) rather than `main()` inline-checking the error message is what lets `parseArgs` remain a plain synchronous function safely unit-tested for argument-parsing behavior without any process.exit side effect leaking into the test process — a generic `Error` from a DB failure or provider failure still exits 1, preserving the distinction between 'you typed the command wrong' and 'something broke at runtime.' The `isDirectInvocation` check compares `import.meta.url` to a `file://`-prefixed `process.argv[1]`; its try/catch guards the `new URL(`file://${process.argv[1]}`)` construction, which can throw on a malformed argv value — `import.meta.url` itself is a static string and never throws, so the try/catch is protecting the argv-to-URL conversion, not the static side of the comparison. This is the same 'importable without side effects' pattern used by import-jsonl.ts and migrate.ts, but implemented differently (URL comparison vs. path-string comparison) — a future reader normalizing these three CLIs onto one pattern should verify both approaches actually behave identically for symlinked invocations (e.g. via an npm bin shim) before consolidating them.

# Citations
[1] BACKFILL-r2mcp-04 evidence: /Users/dustincheng/projects/claudeclaw/docs/specs/asbuilt-living-kb/evidence/backfill04-evidence.yml
