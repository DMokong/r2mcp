---
type: Module
title: src/edges/signals.ts
description: Skeleton concept for src/edges/signals.ts (extracted; 1 symbols).
resource: src/edges/signals.ts
tags:
  - src
  - module
  - function
enrichment: accuracy-audited
from:
  - BACKFILL-r2mcp-06
explains:
  - src/edges/signals.ts#getSignalsForMemoryIds
stale: false
stale_reason: ""
graph_hash: c192643d124600fd68491305707bec2b09c19febe0921e729af00e7c9e27905f
---

# Structure

## Exports
- `getSignalsForMemoryIds` (function, lines 14-72)

## Symbols
| Symbol | Kind | Span | Exported |
|---|---|---|---|
| `getSignalsForMemoryIds` | function | 14-72 | yes |

## Called by
- `recall` in [src/tools/recall.ts](/src/tools/recall.md)

# Explanation
This is the only bridge between the write-side classifier pipeline and the read-side recall() tool — everything the classifier persists to `memory_edges` is invisible to a recall response unless this function surfaces it. It runs once per recall() call, keyed on the set of memory IDs already selected by search/ranking, so it never influences which memories are returned, only what metadata rides alongside them.

# Decisions
- (BACKFILL-r2mcp-06) The trickiest part of this file is the from/to direction flip for `supersedes` edges (lines 59-68), and it exists because two different conventions collide: the classifier (and the DB schema) always stores `(from=newer, to=older)`, but the spec's recall-signal contract (AC8) requires `superseded_by.from_id` to be the OLDER memory pointing at the newer one — the inverse of the storage convention. A future reader changing either the DB write side (stage2-opus.ts / classifier.ts's `insertEdge`) or this read side must keep both conventions and the flip in sync, or supersession signals will silently point backwards. A second asymmetry worth flagging: `contradicts` signals are only surfaced for the OUTGOING direction (`from_memory_id = ANY($1)`), unlike `supersedes` which checks both directions — if memory B contradicts memory A but only B is in the current recall results, the caller gets no signal on B pointing at A. This may be intentional (avoid duplicate signals when both sides of a contradiction are returned together) or an unaddressed gap; the code offers no comment either way, so treat any change here as a judgment call, not a bug fix, until the underlying spec is checked. `valid_until IS NULL` on both queries is the mechanism that makes stale relationships stop surfacing once superseded/retracted — edges are soft-deleted, not hard-deleted, so historical edges remain queryable elsewhere even after they stop appearing here.

# Citations
[1] BACKFILL-r2mcp-06 evidence: /Users/dustincheng/projects/claudeclaw/docs/specs/asbuilt-living-kb/evidence/backfill06-evidence.yml
