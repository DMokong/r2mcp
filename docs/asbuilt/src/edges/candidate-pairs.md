---
type: Module
title: src/edges/candidate-pairs.ts
description: Skeleton concept for src/edges/candidate-pairs.ts (extracted; 3 symbols).
resource: src/edges/candidate-pairs.ts
tags:
  - src
  - module
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
- `CandidateOptions` (interface, lines 11-15)
- `CandidatePair` (interface, lines 4-9)
- `findCandidatePairs` (function, lines 30-56)

## Symbols
| Symbol | Kind | Span | Exported |
|---|---|---|---|
| `CandidateOptions` | interface | 11-15 | yes |
| `CandidatePair` | interface | 4-9 | yes |
| `findCandidatePairs` | function | 30-56 | yes |

## Calls out
- `findCandidatePairs` → [currentScope](/src/env.md)

## Called by
- `main` in [src/cli/classify-edges.ts](/src/cli/classify-edges.md)
- `runClassifier` in [src/edges/classifier.ts](/src/edges/classifier.md)
