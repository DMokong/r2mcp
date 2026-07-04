---
type: Module
title: src/cli/lint-memory.ts
description: Skeleton concept for src/cli/lint-memory.ts (extracted; 5 symbols).
resource: src/cli/lint-memory.ts
enrichment: none
from: []
explains: []
stale: false
graph_hash: 77d367245d49ace6ef0672a008ab019becccb6dbdf36b1e5dba5e4679096f6d2
---

# Structure

## Symbols
| Symbol | Kind | Span | Exported |
|---|---|---|---|
| `CliArgs` | type | 27-27 | no |
| `isCheck` | function | 29-31 | no |
| `main` | function | 83-92 | no |
| `parseArgs` | function | 33-51 | no |
| `renderReport` | function | 53-81 | no |

## Calls out
- `main` → [closeDb](/src/db.md)
- `main` → [exit](/src/index.md)
- `main` → [getPool](/src/db.md)
- `main` → [initDb](/src/db.md)
- `main` → `parseArgs` (same file)
- `main` → `renderReport` (same file)
- `main` → [runLint](/src/lint/run.md)
- `main` → [RunSummaryWriter.write](/src/edges/state.md)
- `parseArgs` → `isCheck` (same file)
