---
type: Module
title: src/cli/export-jsonl.ts
description: Skeleton concept for src/cli/export-jsonl.ts (extracted; 3 symbols).
resource: src/cli/export-jsonl.ts
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
