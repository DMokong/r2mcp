---
type: Module
title: src/lint/checks/stale.ts
description: Skeleton concept for src/lint/checks/stale.ts (extracted; 2 symbols).
resource: src/lint/checks/stale.ts
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
- `findStale` (function, lines 45-61)

## Symbols
| Symbol | Kind | Span | Exported |
|---|---|---|---|
| `StaleRow` | interface | 18-22 | no |
| `findStale` | function | 45-61 | yes |

## Calls out
- `findStale` → [currentScope](/src/env.md)

## Called by
- `runLint` in [src/lint/run.ts](/src/lint/run.md)
