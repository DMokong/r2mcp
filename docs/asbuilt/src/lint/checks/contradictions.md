---
type: Module
title: src/lint/checks/contradictions.ts
description: Skeleton concept for src/lint/checks/contradictions.ts (extracted; 3 symbols).
resource: src/lint/checks/contradictions.ts
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
