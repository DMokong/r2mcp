---
type: Module
title: src/embeddings.ts
description: Skeleton concept for src/embeddings.ts (extracted; 3 symbols).
resource: src/embeddings.ts
enrichment: none
from: []
explains: []
stale: false
graph_hash: 77d367245d49ace6ef0672a008ab019becccb6dbdf36b1e5dba5e4679096f6d2
---

# Structure

## Exports
- `embedBatch` (function, lines 30-66)
- `embedText` (function, lines 68-74)
- `embeddingWarning` (function, lines 23-28)

## Symbols
| Symbol | Kind | Span | Exported |
|---|---|---|---|
| `embedBatch` | function | 30-66 | yes |
| `embedText` | function | 68-74 | yes |
| `embeddingWarning` | function | 23-28 | yes |

## Calls out
- `embedBatch` → [withEmbeddingSpan](/src/telemetry.md)
- `embedText` → `embedBatch` (same file)

## Called by
- `recall` in [src/tools/recall.ts](/src/tools/recall.md)
- `recall` in [src/tools/recall.ts](/src/tools/recall.md)
- `remember` in [src/tools/remember.ts](/src/tools/remember.md)
- `remember` in [src/tools/remember.ts](/src/tools/remember.md)
