---
type: Module
title: src/compiler/tier.ts
description: Skeleton concept for src/compiler/tier.ts (extracted; 2 symbols).
resource: src/compiler/tier.ts
enrichment: none
from: []
explains: []
stale: false
graph_hash: 77d367245d49ace6ef0672a008ab019becccb6dbdf36b1e5dba5e4679096f6d2
---

# Structure

## Exports
- `compileTier` (function, lines 23-93)

## Symbols
| Symbol | Kind | Span | Exported |
|---|---|---|---|
| `compileTier` | function | 23-93 | yes |
| `estimatedCallCost` | function | 100-102 | no |

## Calls out
- `compileTier` → [clusterByTopic](/src/compiler/clustering.md)
- `compileTier` → `estimatedCallCost` (same file)
- `compileTier` → [tierClusterUserPrompt](/src/compiler/prompts.md)
- `compileTier` → [tierSystemPrompt](/src/compiler/prompts.md)
- `compileTier` → [topicTitle](/src/compiler/clustering.md)
- `compileTier` → [withLLMCallSpan](/src/telemetry.md)

## Called by
- `runCompile` in [src/compiler/run.ts](/src/compiler/run.md)
