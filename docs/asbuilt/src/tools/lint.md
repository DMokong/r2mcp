---
type: Module
title: src/tools/lint.ts
description: Skeleton concept for src/tools/lint.ts (extracted; 1 symbols).
resource: src/tools/lint.ts
tags:
  - src
  - module
  - function
enrichment: accuracy-audited
from:
  - BACKFILL-r2mcp-03
explains:
  - src/tools/lint.ts#lint
stale: false
stale_reason: ""
graph_hash: 722abd60fe9a14221204daed15ffc79c1ccb916aa2f11bc37b8d327971cb1d46
---

# Structure

## Exports
- `lint` (function, lines 15-18)

## Symbols
| Symbol | Kind | Span | Exported |
|---|---|---|---|
| `lint` | function | 15-18 | yes |

## Calls out
- `lint` → [getPool](/src/db.md)
- `lint` → [runLint](/src/lint/run.md)

# Explanation
lint() is the thinnest handler in this batch — four lines forwarding straight to `runLint()` in `src/lint/run.ts`. It runs no LLM calls at all, so unlike classify/compile/extract-entities it needs no subprocess delegation: SPEC-044's constraint is scoped specifically to LLM calls, and lint's five checks (contradictions, staleness, orphans, drift, superseded-unflagged) are SQL-only heuristics that never trigger it.

# Decisions
- (BACKFILL-r2mcp-03) `lint()` calls `runLint(input, pool)` with only two of three possible arguments, omitting the `scope` parameter that `meditate.ts` always passes explicitly at its own `runLint({}, pool, scope)` call site. This is easy to misread as an unscoped/unsafe code path by comparison, but it isn't: `runLint`'s own signature defaults `scope: string = currentScope()`, so `lint()` still gets scope isolation, just implicitly via that default rather than an explicit argument. A future reader auditing scope-safety across the tools/ directory should check default parameters, not just call-site argument counts, before concluding a call path is unscoped. The barrel-style `export type { LintInput, LintResult }` re-export exists so MCP tool-registration code elsewhere can import these shapes without reaching into `src/lint/types.ts` directly.

# Citations
[1] BACKFILL-r2mcp-03 evidence: /Users/dustincheng/projects/claudeclaw/docs/specs/asbuilt-living-kb/evidence/backfill03-evidence.yml
