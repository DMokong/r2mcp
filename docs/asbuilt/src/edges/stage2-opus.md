---
type: Module
title: src/edges/stage2-opus.ts
description: Skeleton concept for src/edges/stage2-opus.ts (extracted; 6 symbols).
resource: src/edges/stage2-opus.ts
enrichment: none
from: []
explains: []
stale: false
graph_hash: 77d367245d49ace6ef0672a008ab019becccb6dbdf36b1e5dba5e4679096f6d2
---

# Structure

## Exports
- `MemoryForClassify` (interface, lines 5-9)
- `PairForClassify` (interface, lines 11-14)
- `Stage2Result` (type, lines 16-23)
- `isRejectionPair` (function, lines 68-70)
- `parseStage2Response` (function, lines 72-100)
- `stage2OpusClassify` (function, lines 102-142)

## Symbols
| Symbol | Kind | Span | Exported |
|---|---|---|---|
| `MemoryForClassify` | interface | 5-9 | yes |
| `PairForClassify` | interface | 11-14 | yes |
| `Stage2Result` | type | 16-23 | yes |
| `isRejectionPair` | function | 68-70 | yes |
| `parseStage2Response` | function | 72-100 | yes |
| `stage2OpusClassify` | function | 102-142 | yes |

## Calls out
- `stage2OpusClassify` → `isRejectionPair` (same file)
- `stage2OpusClassify` → `parseStage2Response` (same file)
- `stage2OpusClassify` → [withLLMCallSpan](/src/telemetry.md)

## Called by
- `main` in [src/cli/classify-edges.ts](/src/cli/classify-edges.md)
