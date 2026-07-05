---
type: Module
title: src/edges/types.ts
description: Skeleton concept for src/edges/types.ts (extracted; 4 symbols).
resource: src/edges/types.ts
tags:
  - src
  - module
  - interface
  - type
enrichment: accuracy-audited
from:
  - BACKFILL-r2mcp-06
explains:
  - src/edges/types.ts#EdgeRelation
  - src/edges/types.ts#MemoryEdge
  - src/edges/types.ts#RecallSignal
  - src/edges/types.ts#SignalKind
stale: false
stale_reason: ""
graph_hash: 722abd60fe9a14221204daed15ffc79c1ccb916aa2f11bc37b8d327971cb1d46
---

# Structure

## Exports
- `EdgeRelation` (type, lines 1-7)
- `MemoryEdge` (interface, lines 9-19)
- `RecallSignal` (interface, lines 23-29)
- `SignalKind` (type, lines 21-21)

## Symbols
| Symbol | Kind | Span | Exported |
|---|---|---|---|
| `EdgeRelation` | type | 1-7 | yes |
| `MemoryEdge` | interface | 9-19 | yes |
| `RecallSignal` | interface | 23-29 | yes |
| `SignalKind` | type | 21-21 | yes |

# Explanation
This file has no behavior of its own, but it is the contract every other file in `edges/` (and the read-side consumers in `tools/recall.ts`) agree on. Understanding the deliberate gap between `EdgeRelation` (what gets stored) and `SignalKind` (what gets surfaced at recall time) is the single most important thing to internalize before touching any of the other five files in this module.

# Decisions
- (BACKFILL-r2mcp-06) `EdgeRelation` intentionally excludes `'none'` — `'none'` is a Stage 2 classification OUTCOME (see `stage2-opus.ts#Stage2Result`), never a persisted relation; keeping it out of `EdgeRelation` means any code that reads a `MemoryEdge.relation` from the database can trust it is one of the six meaningful values, with no defensive `'none'` branch needed. `SignalKind`'s two values (`'contradicts' | 'superseded_by'`) are a narrower, curated subset of the six `EdgeRelation` values — this is a product decision (only these two relation types are considered urgent/actionable enough to proactively interrupt a recall response with a warning), not a technical limitation; `'supports'`, `'related_to'`, `'evolved_into'`, and `'depends_on'` edges are written and queryable (e.g. via `dump_edges_sidecar` / graph tooling) but never surface inline in a recall() call. If a future spec wants to surface, say, `depends_on` at recall time, both this type and `signals.ts#getSignalsForMemoryIds` need a matching new branch — adding a value to `SignalKind` alone does nothing without a corresponding query added to signals.ts. `MemoryEdge.valid_until: Date | null` is the soft-invalidation marker that `signals.ts` filters on (`valid_until IS NULL`) — a `null` in this table means "currently active," not "never invalidated" in some absolute sense; the classifier or a future correction tool is expected to set a real timestamp here rather than delete rows when an edge is retracted or replaced.

# Citations
[1] BACKFILL-r2mcp-06 evidence: /Users/dustincheng/projects/claudeclaw/docs/specs/asbuilt-living-kb/evidence/backfill06-evidence.yml
