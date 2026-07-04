---
type: Module
title: src/tools/reject.ts
description: Skeleton concept for src/tools/reject.ts (extracted; 3 symbols).
resource: src/tools/reject.ts
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
- `RejectInput` (interface, lines 5-8)
- `RejectResult` (interface, lines 10-14)
- `reject` (function, lines 16-60)

## Symbols
| Symbol | Kind | Span | Exported |
|---|---|---|---|
| `RejectInput` | interface | 5-8 | yes |
| `RejectResult` | interface | 10-14 | yes |
| `reject` | function | 16-60 | yes |

## Calls out
- `reject` → [currentScope](/src/env.md)
- `reject` → [fingerprint](/src/fingerprint.md)
- `reject` → [getPool](/src/db.md)

## Called by
- `runClaude` in [src/providers/claude-code.ts](/src/providers/claude-code.md)
