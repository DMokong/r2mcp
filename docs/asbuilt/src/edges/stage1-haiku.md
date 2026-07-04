---
type: Module
title: src/edges/stage1-haiku.ts
description: Skeleton concept for src/edges/stage1-haiku.ts (extracted; 4 symbols).
resource: src/edges/stage1-haiku.ts
tags:
  - src
  - module
  - function
  - interface
enrichment: none
from: []
explains: []
stale: false
graph_hash: 54570211ff06c2bd59dd0a2dac52f1722134ad26c899e0f940f3d2a9c0d8f342
---

# Structure

## Exports
- `PairForFilter` (interface, lines 4-7)
- `Stage1Result` (interface, lines 9-13)
- `parseStage1Response` (function, lines 25-35)
- `stage1HaikuFilter` (function, lines 37-57)

## Symbols
| Symbol | Kind | Span | Exported |
|---|---|---|---|
| `PairForFilter` | interface | 4-7 | yes |
| `Stage1Result` | interface | 9-13 | yes |
| `parseStage1Response` | function | 25-35 | yes |
| `stage1HaikuFilter` | function | 37-57 | yes |

## Calls out
- `stage1HaikuFilter` → `parseStage1Response` (same file)
- `stage1HaikuFilter` → [withLLMCallSpan](/src/telemetry.md)

## Called by
- `main` in [src/cli/classify-edges.ts](/src/cli/classify-edges.md)
