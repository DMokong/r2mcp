---
type: Module
title: src/cli/extract-entities.ts
description: Skeleton concept for src/cli/extract-entities.ts (extracted; 7 symbols).
resource: src/cli/extract-entities.ts
enrichment: none
from: []
explains: []
stale: false
graph_hash: 77d367245d49ace6ef0672a008ab019becccb6dbdf36b1e5dba5e4679096f6d2
---

# Structure

## Exports
- `CliArgs` (interface, lines 67-75)
- `UsageError` (class, lines 81-88)
- `parseArgs` (function, lines 90-124)

## Symbols
| Symbol | Kind | Span | Exported |
|---|---|---|---|
| `CliArgs` | interface | 67-75 | yes |
| `UsageError` | class | 81-88 | yes |
| `UsageError.constructor` | method | 83-87 | yes |
| `main` | function | 126-150 | no |
| `parentContextFromEnv` | function | 56-65 | no |
| `parseArgs` | function | 90-124 | yes |
| `runner` | const | 168-180 | no |

## Calls out
- `main` → [closeDb](/src/db.md)
- `main` → [currentScope](/src/env.md)
- `main` → [getPool](/src/db.md)
- `main` → [initDb](/src/db.md)
- `main` → `parseArgs` (same file)
- `main` → [runExtractor](/src/entities/extractor.md)
- `main` → [selectProvider](/src/providers/index.md)
- `main` → [RunSummaryWriter.write](/src/edges/state.md)
- `parseArgs` → [isProviderName](/src/providers/index.md)
- `runner` → [exit](/src/index.md)
- `runner` → `main` (same file)
- `runner` → [RunSummaryWriter.write](/src/edges/state.md)
