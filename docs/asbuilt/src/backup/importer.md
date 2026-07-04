---
type: Module
title: src/backup/importer.ts
description: Skeleton concept for src/backup/importer.ts (extracted; 6 symbols).
resource: src/backup/importer.ts
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
- `ImportOptions` (interface, lines 20-23)
- `ImportSummary` (interface, lines 31-36)
- `TableCounts` (interface, lines 25-29)
- `importFromLines` (function, lines 128-190)

## Symbols
| Symbol | Kind | Span | Exported |
|---|---|---|---|
| `ImportOptions` | interface | 20-23 | yes |
| `ImportSummary` | interface | 31-36 | yes |
| `RowEnvelope` | interface | 38-42 | no |
| `TableCounts` | interface | 25-29 | yes |
| `emptyCounts` | function | 119-126 | no |
| `importFromLines` | function | 128-190 | yes |

## Calls out
- `importFromLines` → `emptyCounts` (same file)

## Called by
- `main` in [src/cli/import-jsonl.ts](/src/cli/import-jsonl.md)
