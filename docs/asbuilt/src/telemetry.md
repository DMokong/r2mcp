---
type: Module
title: src/telemetry.ts
description: Skeleton concept for src/telemetry.ts (extracted; 3 symbols).
resource: src/telemetry.ts
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
- `withEmbeddingSpan` (function, lines 116-148)
- `withLLMCallSpan` (function, lines 84-111)
- `withToolSpan` (function, lines 45-69)

## Symbols
| Symbol | Kind | Span | Exported |
|---|---|---|---|
| `withEmbeddingSpan` | function | 116-148 | yes |
| `withLLMCallSpan` | function | 84-111 | yes |
| `withToolSpan` | function | 45-69 | yes |

## Called by
- `main` in [src/cli/classify-edges.ts](/src/cli/classify-edges.md)
- `main` in [src/cli/compile-wiki.ts](/src/cli/compile-wiki.md)
- `compileTier` in [src/compiler/tier.ts](/src/compiler/tier.md)
- `compileTopic` in [src/compiler/topic.ts](/src/compiler/topic.md)
- `stage1HaikuFilter` in [src/edges/stage1-haiku.ts](/src/edges/stage1-haiku.md)
- `stage2OpusClassify` in [src/edges/stage2-opus.ts](/src/edges/stage2-opus.md)
- `embedBatch` in [src/embeddings.ts](/src/embeddings.md)
- `runExtractor` in [src/entities/extractor.ts](/src/entities/extractor.md)
