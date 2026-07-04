---
type: Module
title: src/lint/checks/orphans.ts
description: Skeleton concept for src/lint/checks/orphans.ts (extracted; 2 symbols).
resource: src/lint/checks/orphans.ts
enrichment: none
from: []
explains: []
stale: false
graph_hash: 77d367245d49ace6ef0672a008ab019becccb6dbdf36b1e5dba5e4679096f6d2
---

# Structure

## Exports
- `findOrphans` (function, lines 37-49)

## Symbols
| Symbol | Kind | Span | Exported |
|---|---|---|---|
| `OrphanRow` | interface | 15-18 | no |
| `findOrphans` | function | 37-49 | yes |

## Calls out
- `findOrphans` → [currentScope](/src/env.md)

## Called by
- `runLint` in [src/lint/run.ts](/src/lint/run.md)
