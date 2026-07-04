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
stale_reason: ""
graph_hash: f3062700a89bb65b1df9622f69f7f24581224e0a7462079dc9cdb4a2395643c0
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
