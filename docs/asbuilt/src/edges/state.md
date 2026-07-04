---
type: Module
title: src/edges/state.ts
description: Skeleton concept for src/edges/state.ts (extracted; 11 symbols).
resource: src/edges/state.ts
tags:
  - src
  - module
  - class
  - function
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
- `RunSummary` (interface, lines 76-92)
- `RunSummaryWriter` (class, lines 94-103)
- `StageRecord` (interface, lines 6-13)
- `StateStore` (class, lines 27-74)
- `pairHash` (function, lines 22-25)

## Symbols
| Symbol | Kind | Span | Exported |
|---|---|---|---|
| `RunSummary` | interface | 76-92 | yes |
| `RunSummaryWriter` | class | 94-103 | yes |
| `RunSummaryWriter.constructor` | method | 95-95 | yes |
| `RunSummaryWriter.write` | method | 97-102 | yes |
| `StageRecord` | interface | 6-13 | yes |
| `StateStore` | class | 27-74 | yes |
| `StateStore.append` | method | 33-36 | yes |
| `StateStore.constructor` | method | 28-31 | yes |
| `StateStore.markActiveRun` | method | 38-42 | yes |
| `StateStore.terminalPairs` | method | 49-73 | yes |
| `pairHash` | function | 22-25 | yes |

## Called by
- `main` in [src/cli/classify-edges.ts](/src/cli/classify-edges.md)
- `main` in [src/cli/compile-wiki.ts](/src/cli/compile-wiki.md)
- `main` in [src/cli/export-jsonl.ts](/src/cli/export-jsonl.md)
- `main` in [src/cli/extract-entities.ts](/src/cli/extract-entities.md)
- `runner` in [src/cli/extract-entities.ts](/src/cli/extract-entities.md)
- `main` in [src/cli/import-jsonl.ts](/src/cli/import-jsonl.md)
- `main` in [src/cli/lint-memory.ts](/src/cli/lint-memory.md)
- `runCompile` in [src/compiler/run.ts](/src/compiler/run.md)
- `processPair` in [src/edges/classifier.ts](/src/edges/classifier.md)
- `processPair` in [src/edges/classifier.ts](/src/edges/classifier.md)
- `processPair` in [src/edges/classifier.ts](/src/edges/classifier.md)
- `runClassifier` in [src/edges/classifier.ts](/src/edges/classifier.md)
- `runClassifier` in [src/edges/classifier.ts](/src/edges/classifier.md)
- `runClassifier` in [src/edges/classifier.ts](/src/edges/classifier.md)
