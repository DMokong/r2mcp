---
type: Module
title: src/lint/checks/superseded-unflagged.ts
description: Skeleton concept for src/lint/checks/superseded-unflagged.ts
  (extracted; 3 symbols).
resource: src/lint/checks/superseded-unflagged.ts
tags:
  - src
  - module
  - function
  - interface
enrichment: accuracy-audited
from:
  - BACKFILL-r2mcp-08
explains:
  - src/lint/checks/superseded-unflagged.ts#SuperUnflaggedRow
  - src/lint/checks/superseded-unflagged.ts#ageDays
  - src/lint/checks/superseded-unflagged.ts#findSupersededUnflagged
stale: false
stale_reason: ""
graph_hash: 722abd60fe9a14221204daed15ffc79c1ccb916aa2f11bc37b8d327971cb1d46
---

# Structure

## Exports
- `findSupersededUnflagged` (function, lines 58-81)

## Symbols
| Symbol | Kind | Span | Exported |
|---|---|---|---|
| `SuperUnflaggedRow` | interface | 21-30 | no |
| `ageDays` | function | 83-86 | no |
| `findSupersededUnflagged` | function | 58-81 | yes |

## Calls out
- `findSupersededUnflagged` → `ageDays` (same file)
- `findSupersededUnflagged` → [currentScope](/src/env.md)

## Called by
- `runLint` in [src/lint/run.ts](/src/lint/run.md)

# Explanation
Looks at edges that already exist and are typed `contradicts`, and flags the
ones whose temporal pattern (from-side strictly newer than to-side, same
general topic) suggests the classifier picked the wrong relation type — it
should have been `supersedes`.

# Decisions
- (BACKFILL-r2mcp-08) The "from is newer" filter lives directly in the SQL `WHERE` clause here
(`m1.created_at > m2.created_at`), whereas `contradictions.ts` computes the
equivalent `fromIsNewer` comparison in JS after fetching both directions —
a future reader tracing "where does newer-side detection happen" needs to
know it's answered differently (SQL predicate vs. post-query JS check) in
these two sibling files, even though both are answering the same underlying
question. The confidence formula (0.85 base, bumped to 0.92 only when
`shared_topics >= 1` AND the age gap is `>= 90` days) was tuned
independently of `contradictions.ts`'s own 0.7/0.85 cascade — despite
looking at similar signals (recency + topic overlap), the two files do not
share thresholds or a common scoring function, so changing one's tuning has
no implied effect on the other. `ageDays()` reparses the SQL's
`created_at::text` output back into a JS `Date` to compute a day count —
a string→text→Date round trip that exists because, unlike `drift.ts`'s
`shared_topics` (computed entirely in SQL), the age gap here is computed in
application code; a future optimization could push this into SQL as
`EXTRACT(day FROM ...)` but hasn't been, so don't assume the two checks'
"similar-looking" computations are implemented the same way. Unlike
`contradictions`, this check's `suggested_action` (`fix_edge_type`) IS
handled by a branch in `run.ts#applyFixes`, so the 0.9 confidence gate is
the only thing standing between a `superseded_unflagged` finding and an
actual DB rewrite — there is no missing-branch gap here the way there is for
`contradictions`.

# Citations
[1] BACKFILL-r2mcp-08 evidence: /Users/dustincheng/projects/claudeclaw/docs/specs/asbuilt-living-kb/evidence/backfill08-evidence.yml
