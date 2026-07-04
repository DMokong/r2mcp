---
type: Module
title: src/entities/db.ts
description: Skeleton concept for src/entities/db.ts (extracted; 12 symbols).
resource: src/entities/db.ts
enrichment: none
from: []
explains: []
stale: false
graph_hash: 77d367245d49ace6ef0672a008ab019becccb6dbdf36b1e5dba5e4679096f6d2
---

# Structure

## Exports
- `CandidateFilter` (interface, lines 149-159)
- `LinkResult` (interface, lines 98-100)
- `UpsertEntityInput` (interface, lines 15-19)
- `UpsertEntityResult` (interface, lines 20-23)
- `findCandidateMemories` (function, lines 160-188)
- `findEntityByInput` (function, lines 54-79)
- `getEntityLinksForMemories` (function, lines 190-219)
- `getTopEntitiesByFrequency` (function, lines 117-147)
- `linkMemoryToEntity` (function, lines 101-115)
- `mergeAliases` (function, lines 81-96)
- `upsertEntity` (function, lines 25-52)

## Symbols
| Symbol | Kind | Span | Exported |
|---|---|---|---|
| `CandidateFilter` | interface | 149-159 | yes |
| `DbClient` | type | 13-13 | no |
| `LinkResult` | interface | 98-100 | yes |
| `UpsertEntityInput` | interface | 15-19 | yes |
| `UpsertEntityResult` | interface | 20-23 | yes |
| `findCandidateMemories` | function | 160-188 | yes |
| `findEntityByInput` | function | 54-79 | yes |
| `getEntityLinksForMemories` | function | 190-219 | yes |
| `getTopEntitiesByFrequency` | function | 117-147 | yes |
| `linkMemoryToEntity` | function | 101-115 | yes |
| `mergeAliases` | function | 81-96 | yes |
| `upsertEntity` | function | 25-52 | yes |

## Calls out
- `findCandidateMemories` → [currentScope](/src/env.md)
- `findEntityByInput` → [currentScope](/src/env.md)
- `findEntityByInput` → [normalizeEntityName](/src/entities/normalize.md)
- `getTopEntitiesByFrequency` → [currentScope](/src/env.md)
- `mergeAliases` → [normalizeEntityName](/src/entities/normalize.md)
- `upsertEntity` → [currentScope](/src/env.md)
- `upsertEntity` → [normalizeEntityName](/src/entities/normalize.md)

## Called by
- `runExtractor` in [src/entities/extractor.ts](/src/entities/extractor.md)
- `runExtractor` in [src/entities/extractor.ts](/src/entities/extractor.md)
- `runExtractor` in [src/entities/extractor.ts](/src/entities/extractor.md)
- `runExtractor` in [src/entities/extractor.ts](/src/entities/extractor.md)
- `recall` in [src/tools/recall.ts](/src/tools/recall.md)
- `recall` in [src/tools/recall.ts](/src/tools/recall.md)
- `seed3MemoriesWithSpeculator` in [tests/entities/recall-entity-filter.test.ts](/tests/entities/recall-entity-filter.test.md)
- `seed3MemoriesWithSpeculator` in [tests/entities/recall-entity-filter.test.ts](/tests/entities/recall-entity-filter.test.md)
