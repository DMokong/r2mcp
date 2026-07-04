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
graph_hash: 54570211ff06c2bd59dd0a2dac52f1722134ad26c899e0f940f3d2a9c0d8f342
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
