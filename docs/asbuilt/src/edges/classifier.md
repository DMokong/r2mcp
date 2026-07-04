---
type: Module
title: src/edges/classifier.ts
description: Skeleton concept for src/edges/classifier.ts (extracted; 6 symbols).
resource: src/edges/classifier.ts
tags:
  - src
  - module
  - const
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
- `ClassifierDeps` (interface, lines 9-40)
- `RunOptions` (interface, lines 42-47)
- `launch` (const, lines 113-118)
- `runClassifier` (function, lines 65-154)

## Symbols
| Symbol | Kind | Span | Exported |
|---|---|---|---|
| `ClassifierDeps` | interface | 9-40 | yes |
| `Counters` | interface | 54-63 | no |
| `RunOptions` | interface | 42-47 | yes |
| `launch` | const | 113-118 | yes |
| `processPair` | function | 156-259 | no |
| `runClassifier` | function | 65-154 | yes |

## Calls out
- `launch` → `processPair` (same file)
- `launch` → [Semaphore.withPermit](/src/providers/semaphore.md)
- `processPair` → [StateStore.append](/src/edges/state.md)
- `processPair` → [pairHash](/src/edges/state.md)
- `processPair` → [RunSummaryWriter.write](/src/edges/state.md)
- `runClassifier` → [findCandidatePairs](/src/edges/candidate-pairs.md)
- `runClassifier` → `launch` (same file)
- `runClassifier` → [StateStore.markActiveRun](/src/edges/state.md)
- `runClassifier` → `processPair` (same file)
- `runClassifier` → [StateStore.terminalPairs](/src/edges/state.md)
- `runClassifier` → [Semaphore.withPermit](/src/providers/semaphore.md)
- `runClassifier` → [RunSummaryWriter.write](/src/edges/state.md)

## Called by
- `main` in [src/cli/classify-edges.ts](/src/cli/classify-edges.md)
