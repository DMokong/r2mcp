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
stale_reason: ""
graph_hash: f3062700a89bb65b1df9622f69f7f24581224e0a7462079dc9cdb4a2395643c0
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
