---
type: Module
title: src/compiler/clustering.ts
description: Skeleton concept for src/compiler/clustering.ts (extracted; 7 symbols).
resource: src/compiler/clustering.ts
tags:
  - src
  - module
  - function
  - interface
enrichment: accuracy-audited
from:
  - BACKFILL-r2mcp-05
explains:
  - src/compiler/clustering.ts#MemoryCluster
  - src/compiler/clustering.ts#clusterByTopic
  - src/compiler/clustering.ts#effectiveDate
  - src/compiler/clustering.ts#memoriesForTopic
  - src/compiler/clustering.ts#pickPrimaryTopic
  - src/compiler/clustering.ts#topicTitle
  - src/compiler/clustering.ts#topicToSlug
stale: false
stale_reason: ""
graph_hash: 722abd60fe9a14221204daed15ffc79c1ccb916aa2f11bc37b8d327971cb1d46
---

# Structure

## Exports
- `MemoryCluster` (interface, lines 12-16)
- `clusterByTopic` (function, lines 25-42)
- `effectiveDate` (function, lines 49-51)
- `memoriesForTopic` (function, lines 57-66)
- `topicTitle` (function, lines 82-88)
- `topicToSlug` (function, lines 75-80)

## Symbols
| Symbol | Kind | Span | Exported |
|---|---|---|---|
| `MemoryCluster` | interface | 12-16 | yes |
| `clusterByTopic` | function | 25-42 | yes |
| `effectiveDate` | function | 49-51 | yes |
| `memoriesForTopic` | function | 57-66 | yes |
| `pickPrimaryTopic` | function | 68-73 | no |
| `topicTitle` | function | 82-88 | yes |
| `topicToSlug` | function | 75-80 | yes |

## Calls out
- `clusterByTopic` → `pickPrimaryTopic` (same file)
- `clusterByTopic` → `topicToSlug` (same file)
- `memoriesForTopic` → `effectiveDate` (same file)

## Called by
- `runCompile` in [src/compiler/run.ts](/src/compiler/run.md)
- `compileTier` in [src/compiler/tier.ts](/src/compiler/tier.md)
- `compileTier` in [src/compiler/tier.ts](/src/compiler/tier.md)
- `compileTopic` in [src/compiler/topic.ts](/src/compiler/topic.md)
- `compileTopic` in [src/compiler/topic.ts](/src/compiler/topic.md)

# Explanation
This module is the single source of deterministic grouping/ordering logic shared by both compile modes (tier wikis and topic wikis). It exists as its own file — rather than being inlined into tier.ts/topic.ts — specifically so both call sites use identical bucketing/sorting rules; if tier.ts and topic.ts each rolled their own clustering, the two wiki types could drift in header casing, sort order, or "uncategorized" handling. The core design constraint (stated in the file's top comment) is that the LLM must never see an unstable list — grouping and sorting happen entirely before any prompt is built, so re-running compile against the same DB state always produces the same cluster headers and `Sources:` citation sets even though the memories arrive from a DB query with no guaranteed order.

# Decisions
- (BACKFILL-r2mcp-05) Three non-obvious things a future reader needs: (1) `pickPrimaryTopic`'s actual rule is "lexicographically smallest topic in the array", not the "first-listed topic" that `clusterByTopic`'s own docstring claims — this is intentional (comment: "so the bucket is stable even if topic order... changes"), but don't trust the outer docstring literally when debugging which bucket a multi-topic memory lands in. (2) `effectiveDate` prefers `event_date` over `created_at`, which only matters for backfilled/historical corpora — for normally-inserted memories the two are usually close, but a bulk historical import will show very different Timeline placement depending on whether `event_date` was populated at insert time; if a Timeline looks chronologically wrong, check whether `event_date` is null for the memories in question before assuming a sort bug. (3) `topicToSlug`/`topicTitle` are lossy inverses of each other (slug collapses everything to `[a-z0-9-]`, title just re-splits on separators and capitalizes) — two different topics that only differ by punctuation or case will collide into the same slug and therefore the same topic page path; there's no collision detection here, so that's a latent multi-topic-one-file hazard a future reader should know is unhandled rather than rediscover from a bug report.

# Citations
[1] BACKFILL-r2mcp-05 evidence: /Users/dustincheng/projects/claudeclaw/docs/specs/asbuilt-living-kb/evidence/backfill05-evidence.yml
