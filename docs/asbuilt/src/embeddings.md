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
graph_hash: 54570211ff06c2bd59dd0a2dac52f1722134ad26c899e0f940f3d2a9c0d8f342
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
