---
type: Module
title: src/cli/compile-wiki.ts
description: Skeleton concept for src/cli/compile-wiki.ts (extracted; 6 symbols).
resource: src/cli/compile-wiki.ts
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
| `CliArgs` | interface | 39-46 | no |
| `gitSha` | function | 156-163 | no |
| `isTier` | function | 50-52 | no |
| `loadMemoriesFromDb` | function | 82-154 | no |
| `main` | function | 170-225 | no |
| `parseArgs` | function | 54-80 | no |

## Calls out
- `loadMemoriesFromDb` → [currentScope](/src/env.md)
- `loadMemoriesFromDb` → [getPool](/src/db.md)
- `main` → [closeDb](/src/db.md)
- `main` → [currentScope](/src/env.md)
- `main` → [exit](/src/index.md)
- `main` → `gitSha` (same file)
- `main` → [initDb](/src/db.md)
- `main` → `loadMemoriesFromDb` (same file)
- `main` → `parseArgs` (same file)
- `main` → [runCompile](/src/compiler/run.md)
- `main` → [selectProvider](/src/providers/index.md)
- `main` → [withToolSpan](/src/telemetry.md)
- `main` → [RunSummaryWriter.write](/src/edges/state.md)
- `parseArgs` → [isProviderName](/src/providers/index.md)
- `parseArgs` → `isTier` (same file)
