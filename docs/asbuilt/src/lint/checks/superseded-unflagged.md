---
type: Module
title: src/lint/checks/superseded-unflagged.ts
description: Skeleton concept for src/lint/checks/superseded-unflagged.ts
  (extracted; 3 symbols).
resource: src/lint/checks/superseded-unflagged.ts
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
