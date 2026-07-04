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
stale_reason: ""
graph_hash: f3062700a89bb65b1df9622f69f7f24581224e0a7462079dc9cdb4a2395643c0
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
