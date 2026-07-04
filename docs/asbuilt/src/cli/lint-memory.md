---
type: Module
title: src/cli/lint-memory.ts
description: Skeleton concept for src/cli/lint-memory.ts (extracted; 5 symbols).
resource: src/cli/lint-memory.ts
tags:
  - src
  - module
  - function
  - type
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
| `CliArgs` | type | 27-27 | no |
| `isCheck` | function | 29-31 | no |
| `main` | function | 83-92 | no |
| `parseArgs` | function | 33-51 | no |
| `renderReport` | function | 53-81 | no |

## Calls out
- `main` → [closeDb](/src/db.md)
- `main` → [exit](/src/index.ts.md)
- `main` → [getPool](/src/db.md)
- `main` → [initDb](/src/db.md)
- `main` → `parseArgs` (same file)
- `main` → `renderReport` (same file)
- `main` → [runLint](/src/lint/run.md)
- `main` → [RunSummaryWriter.write](/src/edges/state.md)
- `parseArgs` → `isCheck` (same file)
