---
type: Module
title: src/lint/checks/superseded-unflagged.ts
description: Skeleton concept for src/lint/checks/superseded-unflagged.ts (extracted; 3 symbols).
resource: src/lint/checks/superseded-unflagged.ts
enrichment: none
from: []
explains: []
stale: false
graph_hash: 77d367245d49ace6ef0672a008ab019becccb6dbdf36b1e5dba5e4679096f6d2
---

# Structure

## Exports
- `findSupersededUnflagged` (function, lines 58-81)

## Symbols
| Symbol | Kind | Span | Exported |
|---|---|---|---|
| `SuperUnflaggedRow` | interface | 21-30 | no |
| `ageDays` | function | 83-86 | no |
| `findSupersededUnflagged` | function | 58-81 | yes |

## Calls out
- `findSupersededUnflagged` → `ageDays` (same file)
- `findSupersededUnflagged` → [currentScope](/src/env.md)

## Called by
- `runLint` in [src/lint/run.ts](/src/lint/run.md)
