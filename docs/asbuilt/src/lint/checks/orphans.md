---
type: Module
title: src/lint/checks/orphans.ts
description: Skeleton concept for src/lint/checks/orphans.ts (extracted; 2 symbols).
resource: src/lint/checks/orphans.ts
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
