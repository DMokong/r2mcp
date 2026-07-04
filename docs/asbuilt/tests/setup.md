---
type: Module
title: tests/setup.ts
description: Skeleton concept for tests/setup.ts (extracted; 2 symbols).
resource: tests/setup.ts
tags:
  - tests
  - module
  - function
enrichment: none
from: []
explains: []
stale: false
stale_reason: ""
graph_hash: f3062700a89bb65b1df9622f69f7f24581224e0a7462079dc9cdb4a2395643c0
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
