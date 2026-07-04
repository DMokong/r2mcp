---
type: Module
title: src/entities/state.ts
description: Skeleton concept for src/entities/state.ts (extracted; 10 symbols).
resource: src/entities/state.ts
tags:
  - src
  - module
  - class
  - interface
  - method
enrichment: none
from: []
explains: []
stale: false
graph_hash: 54570211ff06c2bd59dd0a2dac52f1722134ad26c899e0f940f3d2a9c0d8f342
---

# Structure

## Exports
- `EntityState` (class, lines 23-117)
- `EntityStateInit` (interface, lines 13-17)

## Symbols
| Symbol | Kind | Span | Exported |
|---|---|---|---|
| `EntityState` | class | 23-117 | yes |
| `EntityState.appendRecord` | method | 104-106 | yes |
| `EntityState.close` | method | 108-110 | yes |
| `EntityState.constructor` | method | 29-36 | yes |
| `EntityState.isMemoryTerminal` | method | 56-58 | yes |
| `EntityState.loadTerminalSet` | method | 38-54 | yes |
| `EntityState.recordParseFailed` | method | 88-96 | yes |
| `EntityState.recordTerminal` | method | 72-80 | yes |
| `EntityState.writeRunSummary` | method | 112-116 | yes |
| `EntityStateInit` | interface | 13-17 | yes |

## Calls out
- `EntityState.constructor` → `EntityState.loadTerminalSet` (same file)
- `EntityState.recordParseFailed` → `EntityState.appendRecord` (same file)
- `EntityState.recordTerminal` → `EntityState.appendRecord` (same file)

## Called by
- `finalize` in [src/entities/extractor.ts](/src/entities/extractor.md)
- `finalize` in [src/entities/extractor.ts](/src/entities/extractor.md)
- `runExtractor` in [src/entities/extractor.ts](/src/entities/extractor.md)
- `runExtractor` in [src/entities/extractor.ts](/src/entities/extractor.md)
- `runExtractor` in [src/entities/extractor.ts](/src/entities/extractor.md)
