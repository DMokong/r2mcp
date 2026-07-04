---
type: Module
title: src/migrations.ts
description: Skeleton concept for src/migrations.ts (extracted; 7 symbols).
resource: src/migrations.ts
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

## Exports
- `ApplyResult` (interface, lines 37-41)
- `Migration` (interface, lines 30-35)
- `appliedVersion` (function, lines 83-90)
- `applyMigrations` (function, lines 97-139)
- `expectedSchemaVersion` (function, lines 77-80)
- `listMigrations` (function, lines 48-74)
- `verifySchemaVersion` (function, lines 146-160)

## Symbols
| Symbol | Kind | Span | Exported |
|---|---|---|---|
| `ApplyResult` | interface | 37-41 | yes |
| `Migration` | interface | 30-35 | yes |
| `appliedVersion` | function | 83-90 | yes |
| `applyMigrations` | function | 97-139 | yes |
| `expectedSchemaVersion` | function | 77-80 | yes |
| `listMigrations` | function | 48-74 | yes |
| `verifySchemaVersion` | function | 146-160 | yes |

## Calls out
- `applyMigrations` → `listMigrations` (same file)
- `applyMigrations` → [Semaphore.release](/src/providers/semaphore.md)
- `expectedSchemaVersion` → `listMigrations` (same file)
- `verifySchemaVersion` → `appliedVersion` (same file)
- `verifySchemaVersion` → `expectedSchemaVersion` (same file)

## Called by
- `setup` in [src/cli/setup.ts](/src/cli/setup.md)
- `initDb` in [src/db.ts](/src/db.md)
- `setupTestDb` in [tests/setup.ts](/tests/setup.md)
