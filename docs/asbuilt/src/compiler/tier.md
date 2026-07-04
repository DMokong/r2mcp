---
type: Module
title: src/compiler/tier.ts
description: Skeleton concept for src/compiler/tier.ts (extracted; 2 symbols).
resource: src/compiler/tier.ts
tags:
  - src
  - module
  - function
enrichment: none
from: []
explains: []
stale: false
stale_reason: ""
graph_hash: f3062700a89bb65b1df9622f69f7f24581224e0a7462079dc9cdb4a2395643c0
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
