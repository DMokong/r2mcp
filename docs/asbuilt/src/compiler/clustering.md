---
type: Module
title: src/compiler/clustering.ts
description: Skeleton concept for src/compiler/clustering.ts (extracted; 7 symbols).
resource: src/compiler/clustering.ts
enrichment: none
from: []
explains: []
stale: false
graph_hash: 77d367245d49ace6ef0672a008ab019becccb6dbdf36b1e5dba5e4679096f6d2
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
