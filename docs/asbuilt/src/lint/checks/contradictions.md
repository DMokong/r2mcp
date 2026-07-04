---
type: Module
title: src/lint/checks/contradictions.ts
description: Skeleton concept for src/lint/checks/contradictions.ts (extracted; 3 symbols).
resource: src/lint/checks/contradictions.ts
enrichment: none
from: []
explains: []
stale: false
graph_hash: 77d367245d49ace6ef0672a008ab019becccb6dbdf36b1e5dba5e4679096f6d2
---

# Structure

## Exports
- `PoolLike` (interface, lines 25-30)
- `findContradictions` (function, lines 59-98)

## Symbols
| Symbol | Kind | Span | Exported |
|---|---|---|---|
| `ContradictionRow` | interface | 32-40 | no |
| `PoolLike` | interface | 25-30 | yes |
| `findContradictions` | function | 59-98 | yes |

## Calls out
- `findContradictions` → [currentScope](/src/env.md)

## Called by
- `runLint` in [src/lint/run.ts](/src/lint/run.md)
