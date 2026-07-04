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
graph_hash: 54570211ff06c2bd59dd0a2dac52f1722134ad26c899e0f940f3d2a9c0d8f342
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
