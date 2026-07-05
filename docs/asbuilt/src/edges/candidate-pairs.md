---
type: Module
title: src/edges/candidate-pairs.ts
description: Skeleton concept for src/edges/candidate-pairs.ts (extracted; 3 symbols).
resource: src/edges/candidate-pairs.ts
tags:
  - src
  - module
  - function
  - interface
enrichment: accuracy-audited
from:
  - BACKFILL-r2mcp-06
explains:
  - src/edges/candidate-pairs.ts#CandidateOptions
  - src/edges/candidate-pairs.ts#CandidatePair
  - src/edges/candidate-pairs.ts#findCandidatePairs
stale: false
stale_reason: ""
graph_hash: 722abd60fe9a14221204daed15ffc79c1ccb916aa2f11bc37b8d327971cb1d46
---

# Structure

## Exports
- `CandidateOptions` (interface, lines 11-15)
- `CandidatePair` (interface, lines 4-9)
- `findCandidatePairs` (function, lines 30-56)

## Symbols
| Symbol | Kind | Span | Exported |
|---|---|---|---|
| `CandidateOptions` | interface | 11-15 | yes |
| `CandidatePair` | interface | 4-9 | yes |
| `findCandidatePairs` | function | 30-56 | yes |

## Calls out
- `findCandidatePairs` → [currentScope](/src/env.md)

## Called by
- `main` in [src/cli/classify-edges.ts](/src/cli/classify-edges.md)
- `runClassifier` in [src/edges/classifier.ts](/src/edges/classifier.md)

# Explanation
This is the cheapest of three progressively more expensive filters in the edge classification pipeline (SQL pre-filter -> Stage 1 Haiku -> Stage 2 Opus). Its entire job is to shrink an O(n^2) candidate space down to pairs that are even plausibly related, using only metadata (`topics`, `people` array columns) that Postgres can intersect cheaply — no LLM call happens here. A future reader wondering why a given pair of memories never got classified should check this function first: if the pair doesn't clear >=2 shared topics or >=1 shared person, it never even reaches Stage 1, and there is no logging of "near misses."

# Decisions
- (BACKFILL-r2mcp-06) The `m1.id < m2.id` join condition does double duty: it deduplicates unordered pairs (so (A,B) and (B,A) never both appear) AND excludes self-pairs, in a single predicate — don't simplify this to `m1.id != m2.id` without adding a separate dedup step. The `sinceDays` window clause uses `OR` across `m1.created_at` and `m2.created_at`, not `AND` — this is what lets `--since=7d` incremental runs catch a brand-new memory linking to an old one, not just pairs where both sides are recent; changing this to `AND` would silently break incremental classification for the most common case (new note referencing old context). `CandidateOptions.scope` (claw-nyxd) is a bug-fix addition: an earlier version of this pipeline apparently produced cross-project edges, and this field closes that by scoping both sides of the join to the same `project_scope`. The eligibility thresholds (>=2 topics OR >=1 person) are a tuned trade-off, not a law of nature — loosen them and Stage 1 (Haiku) cost rises on noise pairs; tighten them and real relations get silently missed with no visibility into what was excluded.

# Citations
[1] BACKFILL-r2mcp-06 evidence: /Users/dustincheng/projects/claudeclaw/docs/specs/asbuilt-living-kb/evidence/backfill06-evidence.yml
