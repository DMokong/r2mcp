---
type: Module
title: src/cli/lint-memory.ts
description: Skeleton concept for src/cli/lint-memory.ts (extracted; 5 symbols).
resource: src/cli/lint-memory.ts
tags:
  - src
  - module
  - function
  - type
enrichment: accuracy-audited
from:
  - BACKFILL-r2mcp-04
explains:
  - src/cli/lint-memory.ts#CliArgs
  - src/cli/lint-memory.ts#isCheck
  - src/cli/lint-memory.ts#main
  - src/cli/lint-memory.ts#parseArgs
  - src/cli/lint-memory.ts#renderReport
stale: false
stale_reason: ""
graph_hash: 722abd60fe9a14221204daed15ffc79c1ccb916aa2f11bc37b8d327971cb1d46
---

# Structure

## Symbols
| Symbol | Kind | Span | Exported |
|---|---|---|---|
| `CliArgs` | type | 27-27 | no |
| `isCheck` | function | 29-31 | no |
| `main` | function | 83-92 | no |
| `parseArgs` | function | 33-51 | no |
| `renderReport` | function | 53-81 | no |

## Calls out
- `main` → [closeDb](/src/db.md)
- `main` → [exit](/src/index.ts.md)
- `main` → [getPool](/src/db.md)
- `main` → [initDb](/src/db.md)
- `main` → `parseArgs` (same file)
- `main` → `renderReport` (same file)
- `main` → [runLint](/src/lint/run.md)
- `main` → [RunSummaryWriter.write](/src/edges/state.md)
- `parseArgs` → `isCheck` (same file)

# Explanation
lint-memory.ts is the terminal-facing driver for the SPEC-044 Section C structural lint engine — five purely-SQL checks over `memories`/`memory_edges` (contradictions, staleness, orphaned memories, drift between classified-edge confidence and current content, and edges that should have been marked 'superseded' but weren't) that make LLM-driven `meditate()` output more precise by surfacing structural problems `meditate()` could previously only fix implicitly and inconsistently.

# Decisions
- (BACKFILL-r2mcp-04) The output format — human-readable report first, then a `---` separator, then the full JSON result — is deliberately dual-purpose in a way none of the other CLIs in this directory are: classify-edges.ts and compile-wiki.ts print JSON ONLY (they are meant to be consumed by other tooling or read as a structured run summary), but lint-memory.ts is meant to be run by a human directly at a terminal AND parsed programmatically by the same invocation — the `---` line is the parse boundary a script would split on to isolate the JSON tail. `--fix` is a request, not a blanket permission: `runLint`'s fix logic (not in this file) only actually applies a fix to findings with `confidence >= 0.9`, so lower-confidence findings are always reported but never auto-fixed even when `--fix` is passed — a future reader should not assume passing `--fix` guarantees every listed finding gets acted on. The `topic` field surfaced on some findings (contradictions today) exists specifically so a downstream consumer — SPEC-047's documented lint-to-compile breadcrumb — can route a finding straight into `compile --topic=<topic>` without a second database round-trip to look up which topic a flagged memory belongs to; a future reader adding a new check that produces topic-scoped findings should populate this field too, for consistency with that breadcrumb.

# Citations
[1] BACKFILL-r2mcp-04 evidence: /Users/dustincheng/projects/claudeclaw/docs/specs/asbuilt-living-kb/evidence/backfill04-evidence.yml
