---
type: Module
title: src/tools/extract-entities.ts
description: Skeleton concept for src/tools/extract-entities.ts (extracted; 9 symbols).
resource: src/tools/extract-entities.ts
tags:
  - src
  - module
  - const
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
- `ExtractEntitiesInput` (interface, lines 42-55)
- `ExtractEntitiesToolDeps` (interface, lines 57-64)
- `currentTraceparent` (function, lines 33-40)
- `extractEntitiesTool` (function, lines 66-87)

## Symbols
| Symbol | Kind | Span | Exported |
|---|---|---|---|
| `ExtractEntitiesInput` | interface | 42-55 | yes |
| `ExtractEntitiesToolDeps` | interface | 57-64 | yes |
| `buildArgs` | function | 95-104 | no |
| `currentTraceparent` | function | 33-40 | yes |
| `extractEntitiesTool` | function | 66-87 | yes |
| `parseSummary` | function | 165-211 | no |
| `runSubprocess` | function | 106-163 | no |
| `settle` | const | 130-134 | no |
| `validateInput` | function | 89-93 | no |

## Calls out
- `extractEntitiesTool` → `buildArgs` (same file)
- `extractEntitiesTool` → `currentTraceparent` (same file)
- `extractEntitiesTool` → `parseSummary` (same file)
- `extractEntitiesTool` → [resolveCliCommand](/src/tools/spawn-cli.md)
- `extractEntitiesTool` → `runSubprocess` (same file)
- `extractEntitiesTool` → `validateInput` (same file)
- `runSubprocess` → `settle` (same file)
