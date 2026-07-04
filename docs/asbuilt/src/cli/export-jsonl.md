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
graph_hash: 54570211ff06c2bd59dd0a2dac52f1722134ad26c899e0f940f3d2a9c0d8f342
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
