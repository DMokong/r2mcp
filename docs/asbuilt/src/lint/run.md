---
type: Module
title: src/lint/run.ts
description: Skeleton concept for src/lint/run.ts (extracted; 3 symbols).
resource: src/lint/run.ts
tags:
  - src
  - module
  - function
enrichment: accuracy-audited
from:
  - BACKFILL-r2mcp-08
explains:
  - src/lint/run.ts#applyFixes
  - src/lint/run.ts#buildSummary
  - src/lint/run.ts#runLint
stale: false
stale_reason: ""
graph_hash: 722abd60fe9a14221204daed15ffc79c1ccb916aa2f11bc37b8d327971cb1d46
---

# Structure

## Exports
- `runLint` (function, lines 29-67)

## Symbols
| Symbol | Kind | Span | Exported |
|---|---|---|---|
| `applyFixes` | function | 98-133 | no |
| `buildSummary` | function | 74-87 | no |
| `runLint` | function | 29-67 | yes |

## Calls out
- `runLint` → `applyFixes` (same file)
- `runLint` → `buildSummary` (same file)
- `runLint` → [currentScope](/src/env.md)
- `runLint` → [findContradictions](/src/lint/checks/contradictions.md)
- `runLint` → [findDrift](/src/lint/checks/drift.md)
- `runLint` → [findOrphans](/src/lint/checks/orphans.md)
- `runLint` → [findStale](/src/lint/checks/stale.md)
- `runLint` → [findSupersededUnflagged](/src/lint/checks/superseded-unflagged.md)

## Called by
- `main` in [src/cli/lint-memory.ts](/src/cli/lint-memory.md)
- `lint` in [src/tools/lint.ts](/src/tools/lint.md)
- `meditate` in [src/tools/meditate.ts](/src/tools/meditate.md)

# Explanation
This is the orchestrator for the entire lint subsystem: the single entry point
(`runLint`) that every caller — the CLI driver (`src/cli/lint-memory.ts`), the
MCP tool handler (`src/tools/lint.ts`), and `meditate()`'s opt-in
`include_lint` flag (`src/tools/meditate.ts`) — goes through. It fans out to
the five independent check modules under `src/lint/checks/`, merges their
findings into one array, always reports a stable per-check summary shape, and
is the only place in the lint subsystem that is allowed to mutate the
database (via `applyFixes`, gated by `input.fix` and per-finding confidence).
A future reader who wants to add a sixth check needs to touch four things:
add the check name to `CheckName`/`ALL_CHECKS` in types.ts, write the check
module, add a branch to the `for (const check of checksToRun)` loop here, and
add its key to `buildSummary`'s `by_check` seed object.

# Decisions
- (BACKFILL-r2mcp-08) Lint is deliberately SQL-only (no LLM calls, SPEC-044 constraint C.R5) — this
is why it runs synchronously inline inside the MCP server process
(`src/tools/lint.ts` calls it directly against the shared pool) instead of
forking a subprocess the way `compile()` does for its LLM-backed work.
The scope-threading here is redundant by design, not accident: `runLint`
resolves `scope` once via `currentScope()` but still passes it explicitly into
every check call and into `applyFixes`, and each check independently falls
back to `currentScope()` if no scope is passed. This came out of a real bug
(`claw-nyxd`) where lint's findings — and worse, its `--fix` — could touch
another project's rows; the redundancy is defense-in-depth so a future check
author can't silently reintroduce that class of bug by forgetting to thread
scope through one query.

`applyFixes` only implements two of five checks (`stale` → archive,
`superseded_unflagged` → rewrite edge relation) via an if/else chain keyed on
`f.check` plus `f.suggested_action`. For `orphans` and `drift` the missing
branch is belt-and-suspenders: both checks pin their confidence to a fixed
value below `FIX_CONFIDENCE_THRESHOLD` (0.6 and 0.55 respectively), so they'd
never clear the confidence gate even if a branch existed. `contradictions` is
the case a future reader is most likely to get wrong by inference: unlike the
other four checks, its confidence is not a check-local heuristic constant —
`findContradictions` passes the underlying edge's own classifier-assigned
`confidence` straight through, unbounded (`e.confidence::float`). That means a
contradictions finding CAN legitimately sit at 0.95 or higher and clear the
0.9 gate. It is still never auto-fixed, because `applyFixes`'s if/else chain
has no branch at all for `f.check === 'contradictions'` — none of its three
possible `suggested_action` values (`add_supersedes_edge`, `archive_one`,
`human_review`) are handled anywhere in the chain. Read the code literally and
this looks like it could be an unfinished feature rather than a settled design
choice: there is no comment in `run.ts` explaining why contradictions was left
out specifically, unlike orphans/drift where the fixed low confidence makes
the exclusion self-evident from the check's own file. A future engineer
extending `applyFixes` (e.g. to auto-apply `add_supersedes_edge` for
high-confidence contradictions) should treat this as an open design question
to raise, not something already decided against. `buildSummary`'s pre-seeded
zero-counts for all five checks (even when only one check ran, e.g. via
`--check=stale`) exists purely so response consumers never have to
defensively check whether a key is present — documented in the source as
C.AC2 shape-stability.

# Citations
[1] BACKFILL-r2mcp-08 evidence: /Users/dustincheng/projects/claudeclaw/docs/specs/asbuilt-living-kb/evidence/backfill08-evidence.yml
