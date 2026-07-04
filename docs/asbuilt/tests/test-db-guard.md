---
type: Module
title: tests/test-db-guard.ts
description: Skeleton concept for tests/test-db-guard.ts (extracted; 3 symbols).
resource: tests/test-db-guard.ts
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
- `enforceTestDbUrl` (function, lines 72-84)
- `pickTestUrl` (function, lines 25-62)

## Symbols
| Symbol | Kind | Span | Exported |
|---|---|---|---|
| `enforceTestDbUrl` | function | 72-84 | yes |
| `isLocalHost` | function | 21-23 | no |
| `pickTestUrl` | function | 25-62 | yes |

## Calls out
- `enforceTestDbUrl` → `pickTestUrl` (same file)
- `pickTestUrl` → `isLocalHost` (same file)

## Called by
- `setupEdgesTestDb` in [tests/edges/setup.ts](/tests/edges/setup.md)
- `setupTestDb` in [tests/setup.ts](/tests/setup.md)
