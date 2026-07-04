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
graph_hash: 54570211ff06c2bd59dd0a2dac52f1722134ad26c899e0f940f3d2a9c0d8f342
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
