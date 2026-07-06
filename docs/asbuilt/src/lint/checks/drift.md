---
type: Module
title: src/lint/checks/drift.ts
description: Skeleton concept for src/lint/checks/drift.ts (extracted; 2 symbols).
resource: src/lint/checks/drift.ts
tags:
  - src
  - module
  - function
  - interface
enrichment: accuracy-audited
from:
  - BACKFILL-r2mcp-08
explains:
  - src/lint/checks/drift.ts#DriftRow
  - src/lint/checks/drift.ts#findDrift
stale: false
stale_reason: ""
graph_hash: c192643d124600fd68491305707bec2b09c19febe0921e729af00e7c9e27905f
---

# Structure

## Exports
- `findDrift` (function, lines 50-63)

## Symbols
| Symbol | Kind | Span | Exported |
|---|---|---|---|
| `DriftRow` | interface | 19-23 | no |
| `findDrift` | function | 50-63 | yes |

## Calls out
- `findDrift` → [currentScope](/src/env.md)

## Called by
- `runLint` in [src/lint/run.ts](/src/lint/run.md)

# Explanation
Looks for pairs of memories that share enough topics and enough time apart
that they plausibly SHOULD be linked, but have no edge of any kind between
them yet — surfacing gaps in what the classifier (`src/edges/`) has actually
looked at, as opposed to disagreements about an edge that already exists.

# Decisions
- (BACKFILL-r2mcp-08) The explicit self-distinction from `superseded_unflagged` is worth
preserving for a future reader: these two checks are easy to conflate
because both deal with "is this contradicts/supersedes relationship
correct," but drift means NO edge exists (classifier hasn't run on this
pair at all) while superseded_unflagged means an edge exists with the wrong
TYPE. Confidence is pinned to a flat 0.55 regardless of how many topics are
shared or how large the time gap is — this is deliberately below
`FIX_CONFIDENCE_THRESHOLD` so a drift finding can never trigger a direct DB
mutation via `--fix`; the only allowed action is `reclassify`, i.e. defer to
the classifier rather than have lint guess at a relation type itself. (There
is also no dispatch branch for `drift` in `run.ts#applyFixes` at all, so the
confidence pin and the missing branch are both true here — unlike
`contradictions`, where only the missing branch actually does the work of
blocking `--fix`, since that check's confidence is not capped.) The
`NOT EXISTS` clause excludes a pair if it has an edge of ANY relation in
EITHER direction — so a pair that already has, say, an unrelated or
low-confidence edge will never show up as drift even if that edge looks
wrong; that's `superseded_unflagged`'s job, not drift's. The shared-topic
count subquery is written twice (SELECT and WHERE) rather than computed once
and filtered on an alias — a minor inefficiency, noted here so it doesn't
look like unnoticed duplication to a future maintainer. The 30-day gap and
2-topic thresholds are SQL literals, not exposed through `LintInput` the way
`stale`'s `since_days` is — there is currently no way for a caller to tune
drift sensitivity without editing this file.

# Citations
[1] BACKFILL-r2mcp-08 evidence: /Users/dustincheng/projects/claudeclaw/docs/specs/asbuilt-living-kb/evidence/backfill08-evidence.yml
