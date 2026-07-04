---
type: Module
title: src/embeddings.ts
description: Skeleton concept for src/embeddings.ts (extracted; 3 symbols).
resource: src/embeddings.ts
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
