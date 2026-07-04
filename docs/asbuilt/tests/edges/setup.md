---
type: Module
title: tests/edges/setup.ts
description: Skeleton concept for tests/edges/setup.ts (extracted; 4 symbols).
resource: tests/edges/setup.ts
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
- `insertTestMemory` (function, lines 22-38)
- `resetEdgesTestDb` (function, lines 17-20)
- `setupEdgesTestDb` (function, lines 4-11)
- `teardownEdgesTestDb` (function, lines 13-15)

## Symbols
| Symbol | Kind | Span | Exported |
|---|---|---|---|
| `insertTestMemory` | function | 22-38 | yes |
| `resetEdgesTestDb` | function | 17-20 | yes |
| `setupEdgesTestDb` | function | 4-11 | yes |
| `teardownEdgesTestDb` | function | 13-15 | yes |

## Calls out
- `setupEdgesTestDb` → [getPool](/src/db.md)
- `setupEdgesTestDb` → [initDb](/src/db.md)
- `setupEdgesTestDb` → [pickTestUrl](/tests/test-db-guard.md)
- `teardownEdgesTestDb` → [closeDb](/src/db.md)
