---
type: Module
title: tests/setup.ts
description: Skeleton concept for tests/setup.ts (extracted; 2 symbols).
resource: tests/setup.ts
enrichment: none
from: []
explains: []
stale: false
graph_hash: 77d367245d49ace6ef0672a008ab019becccb6dbdf36b1e5dba5e4679096f6d2
---

# Structure

## Exports
- `setupTestDb` (function, lines 5-14)
- `teardownTestDb` (function, lines 16-18)

## Symbols
| Symbol | Kind | Span | Exported |
|---|---|---|---|
| `setupTestDb` | function | 5-14 | yes |
| `teardownTestDb` | function | 16-18 | yes |

## Calls out
- `setupTestDb` → [applyMigrations](/src/migrations.md)
- `setupTestDb` → [getPool](/src/db.md)
- `setupTestDb` → [initDb](/src/db.md)
- `setupTestDb` → [pickTestUrl](/tests/test-db-guard.md)
- `teardownTestDb` → [closeDb](/src/db.md)
