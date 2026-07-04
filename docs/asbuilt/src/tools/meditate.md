---
type: Module
title: src/tools/meditate.ts
description: Skeleton concept for src/tools/meditate.ts (extracted; 8 symbols).
resource: src/tools/meditate.ts
enrichment: none
from: []
explains: []
stale: false
graph_hash: 77d367245d49ace6ef0672a008ab019becccb6dbdf36b1e5dba5e4679096f6d2
---

# Structure

## Exports
- `MeditateInput` (interface, lines 7-16)
- `MeditateResult` (interface, lines 18-30)
- `meditate` (function, lines 32-76)

## Symbols
| Symbol | Kind | Span | Exported |
|---|---|---|---|
| `MeditateInput` | interface | 7-16 | yes |
| `MeditateResult` | interface | 18-30 | yes |
| `archiveStale` | function | 84-119 | no |
| `countCrossReferencePairs` | function | 150-172 | no |
| `countDuplicateFingerprints` | function | 125-144 | no |
| `countTopicClusters` | function | 178-192 | no |
| `meditate` | function | 32-76 | yes |
| `surfaceGaps` | function | 198-216 | no |

## Calls out
- `meditate` → `archiveStale` (same file)
- `meditate` → `countCrossReferencePairs` (same file)
- `meditate` → `countDuplicateFingerprints` (same file)
- `meditate` → `countTopicClusters` (same file)
- `meditate` → [currentScope](/src/env.md)
- `meditate` → [getPool](/src/db.md)
- `meditate` → [runLint](/src/lint/run.md)
- `meditate` → `surfaceGaps` (same file)
- `meditate` → [triggerGraphRebuild](/src/graph-rebuild.md)
