---
type: Module
title: src/tools/classify.ts
description: Skeleton concept for src/tools/classify.ts (extracted; 8 symbols).
resource: src/tools/classify.ts
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
- `ClassifySummary` (interface, lines 27-41)
- `ClassifyToolDeps` (interface, lines 43-47)
- `ClassifyToolInput` (interface, lines 14-25)
- `classify` (function, lines 49-61)

## Symbols
| Symbol | Kind | Span | Exported |
|---|---|---|---|
| `ClassifySummary` | interface | 27-41 | yes |
| `ClassifyToolDeps` | interface | 43-47 | yes |
| `ClassifyToolInput` | interface | 14-25 | yes |
| `buildArgs` | function | 63-71 | no |
| `classify` | function | 49-61 | yes |
| `parseSummary` | function | 120-166 | no |
| `runSubprocess` | function | 73-118 | no |
| `settle` | const | 85-89 | no |

## Calls out
- `classify` → `buildArgs` (same file)
- `classify` → `parseSummary` (same file)
- `classify` → [resolveCliCommand](/src/tools/spawn-cli.md)
- `classify` → `runSubprocess` (same file)
- `runSubprocess` → `settle` (same file)
