---
type: Module
title: src/cli/compile-wiki.ts
description: Skeleton concept for src/cli/compile-wiki.ts (extracted; 6 symbols).
resource: src/cli/compile-wiki.ts
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
- `main` → [exit](/src/index.ts.md)
- `main` → `gitSha` (same file)
- `main` → [initDb](/src/db.md)
- `main` → `loadMemoriesFromDb` (same file)
- `main` → `parseArgs` (same file)
- `main` → [runCompile](/src/compiler/run.md)
- `main` → [selectProvider](/src/providers/index.ts.md)
- `main` → [withToolSpan](/src/telemetry.md)
- `main` → [RunSummaryWriter.write](/src/edges/state.md)
- `parseArgs` → [isProviderName](/src/providers/index.ts.md)
- `parseArgs` → `isTier` (same file)
