---
type: Module
title: src/compiler/topic.ts
description: Skeleton concept for src/compiler/topic.ts (extracted; 2 symbols).
resource: src/compiler/topic.ts
enrichment: none
from: []
explains: []
stale: false
graph_hash: 77d367245d49ace6ef0672a008ab019becccb6dbdf36b1e5dba5e4679096f6d2
---

# Structure

## Exports
- `compileTopic` (function, lines 24-114)

## Symbols
| Symbol | Kind | Span | Exported |
|---|---|---|---|
| `compileTopic` | function | 24-114 | yes |
| `sectionMemoryIds` | function | 116-125 | no |

## Calls out
- `compileTopic` → [effectiveDate](/src/compiler/clustering.md)
- `compileTopic` → [memoriesForTopic](/src/compiler/clustering.md)
- `compileTopic` → `sectionMemoryIds` (same file)
- `compileTopic` → [topicSectionUserPrompt](/src/compiler/prompts.md)
- `compileTopic` → [topicSystemPrompt](/src/compiler/prompts.md)
- `compileTopic` → [withLLMCallSpan](/src/telemetry.md)

## Called by
- `runCompile` in [src/compiler/run.ts](/src/compiler/run.md)
