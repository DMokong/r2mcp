---
type: Module
title: src/cli/export-jsonl.ts
description: Skeleton concept for src/cli/export-jsonl.ts (extracted; 3 symbols).
resource: src/cli/export-jsonl.ts
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

## Symbols
| Symbol | Kind | Span | Exported |
|---|---|---|---|
| `CliArgs` | interface | 25-28 | no |
| `main` | function | 40-62 | no |
| `parseArgs` | function | 30-38 | no |

## Calls out
- `main` → [closeDb](/src/db.md)
- `main` → [connectDb](/src/db.md)
- `main` → [exportToLines](/src/backup/exporter.md)
- `main` → [getPool](/src/db.md)
- `main` → `parseArgs` (same file)
- `main` → [RunSummaryWriter.write](/src/edges/state.md)
