---
type: Module
title: src/index.ts
description: Skeleton concept for src/index.ts (extracted; 3 symbols).
resource: src/index.ts
tags:
  - src
  - module
  - const
  - function
enrichment: none
from: []
explains: []
stale: false
stale_reason: ""
graph_hash: f3062700a89bb65b1df9622f69f7f24581224e0a7462079dc9cdb4a2395643c0
---

# Structure

## Symbols
| Symbol | Kind | Span | Exported |
|---|---|---|---|
| `exit` | const | 555-558 | no |
| `main` | function | 566-576 | no |
| `wireParentDisconnectHandlers` | function | 554-564 | no |

## Calls out
- `exit` → `exit` (same file)
- `main` → [initDb](/src/db.md)
- `main` → `wireParentDisconnectHandlers` (same file)
- `wireParentDisconnectHandlers` → `exit` (same file)

## Called by
- `main` in [src/cli/classify-edges.ts](/src/cli/classify-edges.md)
- `main` in [src/cli/compile-wiki.ts](/src/cli/compile-wiki.md)
- `runner` in [src/cli/extract-entities.ts](/src/cli/extract-entities.md)
- `main` in [src/cli/import-jsonl.ts](/src/cli/import-jsonl.md)
- `main` in [src/cli/lint-memory.ts](/src/cli/lint-memory.md)
- `setup` in [src/cli/setup.ts](/src/cli/setup.md)
