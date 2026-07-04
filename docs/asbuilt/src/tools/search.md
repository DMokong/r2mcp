---
type: Module
title: src/tools/search.ts
description: Skeleton concept for src/tools/search.ts (extracted; 5 symbols).
resource: src/tools/search.ts
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
- `SearchFilter` (interface, lines 4-11)
- `SearchInput` (interface, lines 13-19)
- `SearchResult` (interface, lines 34-37)
- `SearchResultEntry` (interface, lines 21-32)
- `search` (function, lines 39-125)

## Symbols
| Symbol | Kind | Span | Exported |
|---|---|---|---|
| `SearchFilter` | interface | 4-11 | yes |
| `SearchInput` | interface | 13-19 | yes |
| `SearchResult` | interface | 34-37 | yes |
| `SearchResultEntry` | interface | 21-32 | yes |
| `search` | function | 39-125 | yes |

## Calls out
- `search` → [currentScope](/src/env.md)
- `search` → [getPool](/src/db.md)
