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
graph_hash: 54570211ff06c2bd59dd0a2dac52f1722134ad26c899e0f940f3d2a9c0d8f342
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
