---
type: Module
title: src/edges/candidate-pairs.ts
description: Skeleton concept for src/edges/candidate-pairs.ts (extracted; 3 symbols).
resource: src/edges/candidate-pairs.ts
enrichment: none
from: []
explains: []
stale: false
graph_hash: 77d367245d49ace6ef0672a008ab019becccb6dbdf36b1e5dba5e4679096f6d2
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
