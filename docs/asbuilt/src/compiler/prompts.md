---
type: Module
title: src/compiler/prompts.ts
description: Skeleton concept for src/compiler/prompts.ts (extracted; 6 symbols).
resource: src/compiler/prompts.ts
enrichment: none
from: []
explains: []
stale: false
graph_hash: 77d367245d49ace6ef0672a008ab019becccb6dbdf36b1e5dba5e4679096f6d2
---

# Structure

## Exports
- `memoryListPromptFragment` (function, lines 35-37)
- `tierClusterUserPrompt` (function, lines 39-50)
- `tierSystemPrompt` (function, lines 21-27)
- `topicSectionUserPrompt` (function, lines 52-68)
- `topicSystemPrompt` (function, lines 29-33)

## Symbols
| Symbol | Kind | Span | Exported |
|---|---|---|---|
| `describeEdges` | function | 74-91 | no |
| `memoryListPromptFragment` | function | 35-37 | yes |
| `tierClusterUserPrompt` | function | 39-50 | yes |
| `tierSystemPrompt` | function | 21-27 | yes |
| `topicSectionUserPrompt` | function | 52-68 | yes |
| `topicSystemPrompt` | function | 29-33 | yes |

## Calls out
- `tierClusterUserPrompt` → `describeEdges` (same file)
- `tierClusterUserPrompt` → `memoryListPromptFragment` (same file)
- `topicSectionUserPrompt` → `describeEdges` (same file)
- `topicSectionUserPrompt` → `memoryListPromptFragment` (same file)

## Called by
- `compileTier` in [src/compiler/tier.ts](/src/compiler/tier.md)
- `compileTier` in [src/compiler/tier.ts](/src/compiler/tier.md)
- `compileTopic` in [src/compiler/topic.ts](/src/compiler/topic.md)
- `compileTopic` in [src/compiler/topic.ts](/src/compiler/topic.md)
