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
stale_reason: ""
graph_hash: f3062700a89bb65b1df9622f69f7f24581224e0a7462079dc9cdb4a2395643c0
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
