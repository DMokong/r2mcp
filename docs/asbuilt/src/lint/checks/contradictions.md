---
type: Module
title: src/lint/checks/contradictions.ts
description: Skeleton concept for src/lint/checks/contradictions.ts (extracted; 3 symbols).
resource: src/lint/checks/contradictions.ts
tags:
  - src
  - module
  - function
  - interface
enrichment: accuracy-audited
from:
  - BACKFILL-r2mcp-08
explains:
  - src/lint/checks/contradictions.ts#ContradictionRow
  - src/lint/checks/contradictions.ts#PoolLike
  - src/lint/checks/contradictions.ts#findContradictions
stale: false
stale_reason: ""
graph_hash: 722abd60fe9a14221204daed15ffc79c1ccb916aa2f11bc37b8d327971cb1d46
---

# Structure

## Exports
- `PoolLike` (interface, lines 25-30)
- `findContradictions` (function, lines 59-98)

## Symbols
| Symbol | Kind | Span | Exported |
|---|---|---|---|
| `ContradictionRow` | interface | 32-40 | no |
| `PoolLike` | interface | 25-30 | yes |
| `findContradictions` | function | 59-98 | yes |

## Calls out
- `findContradictions` → [currentScope](/src/env.md)

## Called by
- `runLint` in [src/lint/run.ts](/src/lint/run.md)

# Explanation
Surfaces existing `contradicts` edges and routes each one to one of three
outcomes (convert to supersedes, archive one side, or ask a human) based on
recency and the classifier's own stored confidence. This check also doubles
as the shared "primitives" module for the whole check family: its `PoolLike`
interface is imported by all four sibling checks.

# Decisions
- (BACKFILL-r2mcp-08) The three-way action cascade (newer-from-side + confidence>=0.7 →
add_supersedes_edge; else confidence>=0.85 → archive_one; else
human_review) is a heuristic baked directly into the function body, not
configuration — tuning it requires a code change and a new test, not an env
var or LintInput field. Only `valid_until IS NULL` edges are considered,
which means a contradiction that a previous lint run (or the classifier)
already resolved by invalidating the edge will not resurface here — this is
what makes lint idempotent across repeated runs rather than nagging forever
about something already fixed. `topic` is taken from the FROM side's first
topic only (`r.from_topics[0]`) purely to support the SPEC-047
`compile --topic=<t>` breadcrumb without a second DB round trip — if a memory
has several topics, the rest are silently unused here (this is a UX
shortcut, not a data-loss bug, since the full topic list is still on the
memory row itself). `PoolLike` living in this file rather than in a shared
"primitives" or `types.ts` module is a naming/organization quirk a future
refactor might want to fix — but doing so touches all five check files'
imports at once, so it hasn't been moved.

One gotcha specific to this file's `confidence` field: unlike every other
check in the family, it is not computed here at all — it's
`e.confidence::float`, the underlying edge's own classifier-assigned score
(from `src/edges/`), passed straight through unbounded. That means a
contradictions finding CAN legitimately reach or exceed
`FIX_CONFIDENCE_THRESHOLD` (0.9), unlike orphans (fixed 0.6) or drift (fixed
0.55), which structurally never can. It is still never auto-fixed by
`lint --fix`, because `run.ts#applyFixes`'s if/else dispatch chain has no
branch at all for `f.check === 'contradictions'` — none of `add_supersedes_
edge`, `archive_one`, or `human_review` are handled there. That is a gap in
the dispatch chain, not a confidence-cascade limitation, and there is no
comment in `run.ts` explaining the omission — a future reader should not
assume it was a deliberate, documented decision.

# Citations
[1] BACKFILL-r2mcp-08 evidence: /Users/dustincheng/projects/claudeclaw/docs/specs/asbuilt-living-kb/evidence/backfill08-evidence.yml
