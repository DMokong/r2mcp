---
type: Module
title: src/providers/semaphore.ts
description: Skeleton concept for src/providers/semaphore.ts (extracted; 7 symbols).
resource: src/providers/semaphore.ts
enrichment: none
from: []
explains: []
stale: false
graph_hash: 77d367245d49ace6ef0672a008ab019becccb6dbdf36b1e5dba5e4679096f6d2
---

# Structure

## Exports
- `Semaphore` (class, lines 9-51)

## Symbols
| Symbol | Kind | Span | Exported |
|---|---|---|---|
| `Semaphore` | class | 9-51 | yes |
| `Semaphore.acquire` | method | 26-35 | yes |
| `Semaphore.constructor` | method | 14-16 | yes |
| `Semaphore.inFlight` | method | 18-20 | yes |
| `Semaphore.peak` | method | 22-24 | yes |
| `Semaphore.release` | method | 37-41 | yes |
| `Semaphore.withPermit` | method | 43-50 | yes |

## Calls out
- `Semaphore.withPermit` → `Semaphore.acquire` (same file)
- `Semaphore.withPermit` → `Semaphore.release` (same file)

## Called by
- `setup` in [src/cli/setup.ts](/src/cli/setup.md)
- `connectDb` in [src/db.ts](/src/db.md)
- `launch` in [src/edges/classifier.ts](/src/edges/classifier.md)
- `runClassifier` in [src/edges/classifier.ts](/src/edges/classifier.md)
- `applyMigrations` in [src/migrations.ts](/src/migrations.md)
