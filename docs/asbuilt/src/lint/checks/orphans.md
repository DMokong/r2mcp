---
type: Module
title: src/lint/checks/orphans.ts
description: Skeleton concept for src/lint/checks/orphans.ts (extracted; 2 symbols).
resource: src/lint/checks/orphans.ts
tags:
  - src
  - module
  - function
  - interface
enrichment: accuracy-audited
from:
  - BACKFILL-r2mcp-08
explains:
  - src/lint/checks/orphans.ts#OrphanRow
  - src/lint/checks/orphans.ts#findOrphans
stale: false
stale_reason: ""
graph_hash: 722abd60fe9a14221204daed15ffc79c1ccb916aa2f11bc37b8d327971cb1d46
---

# Structure

## Exports
- `findOrphans` (function, lines 37-49)

## Symbols
| Symbol | Kind | Span | Exported |
|---|---|---|---|
| `OrphanRow` | interface | 15-18 | no |
| `findOrphans` | function | 37-49 | yes |

## Calls out
- `findOrphans` → [currentScope](/src/env.md)

## Called by
- `runLint` in [src/lint/run.ts](/src/lint/run.md)

# Explanation
Finds memories with literally zero edges in either direction, older than 30
days. This is the most conservative check in the family — it never suggests
more than human review, because SQL has no way to tell a deliberately
isolated insight from noise.

# Decisions
- (BACKFILL-r2mcp-08) Confidence is a flat 0.6, always below `FIX_CONFIDENCE_THRESHOLD`, and
`suggested_action` is always `human_review` — there is correspondingly no
branch for `orphans` in `run.ts#applyFixes`, so `lint --fix` is a
permanent, intentional no-op for this check, not an unimplemented feature.
A memory whose only edge has been invalidated (`valid_until` set) still
counts as orphaned — the `NOT EXISTS` clause filters on `valid_until IS
NULL`, matching the "currently valid edges only" convention used by
`contradictions.ts` and `stale.ts`. The 30-day age floor is a SQL literal
(unlike `stale`'s caller-tunable `since_days`); a future reader wanting to
surface orphans sooner or later must edit this file directly, there is no
`LintInput` knob for it.

# Citations
[1] BACKFILL-r2mcp-08 evidence: /Users/dustincheng/projects/claudeclaw/docs/specs/asbuilt-living-kb/evidence/backfill08-evidence.yml
