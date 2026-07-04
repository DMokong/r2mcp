---
type: Module
title: src/tools/remember.ts
description: Skeleton concept for src/tools/remember.ts (extracted; 7 symbols).
resource: src/tools/remember.ts
tags:
  - src
  - module
  - function
  - interface
  - type
enrichment: none
from: []
explains: []
stale: false
graph_hash: 54570211ff06c2bd59dd0a2dac52f1722134ad26c899e0f940f3d2a9c0d8f342
---

# Structure

## Exports
- `MemoryMetadata` (interface, lines 20-26)
- `MemoryType` (type, lines 12-18)
- `Operation` (type, lines 10-10)
- `RememberInput` (interface, lines 28-34)
- `RememberResult` (interface, lines 36-43)
- `Tier` (type, lines 11-11)
- `remember` (function, lines 45-225)

## Symbols
| Symbol | Kind | Span | Exported |
|---|---|---|---|
| `MemoryMetadata` | interface | 20-26 | yes |
| `MemoryType` | type | 12-18 | yes |
| `Operation` | type | 10-10 | yes |
| `RememberInput` | interface | 28-34 | yes |
| `RememberResult` | interface | 36-43 | yes |
| `Tier` | type | 11-11 | yes |
| `remember` | function | 45-225 | yes |

## Calls out
- `remember` → [currentScope](/src/env.md)
- `remember` → [embedText](/src/embeddings.md)
- `remember` → [embeddingWarning](/src/embeddings.md)
- `remember` → [fingerprint](/src/fingerprint.md)
- `remember` → [getPool](/src/db.md)
- `remember` → [triggerGraphRebuild](/src/graph-rebuild.md)

## Called by
- `migrate` in [src/cli/migrate.ts](/src/cli/migrate.md)
- `insertBackdated` in [tests/gauntlet.test.ts](/tests/gauntlet.test.md)
- `addIn` in [tests/scope-isolation.test.ts](/tests/scope-isolation.test.md)
