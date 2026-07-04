---
type: Module
title: src/entities/extractor.ts
description: Skeleton concept for src/entities/extractor.ts (extracted; 3 symbols).
resource: src/entities/extractor.ts
enrichment: none
from: []
explains: []
stale: false
graph_hash: 77d367245d49ace6ef0672a008ab019becccb6dbdf36b1e5dba5e4679096f6d2
---

# Structure

## Exports
- `RunExtractorOptions` (interface, lines 25-36)
- `runExtractor` (function, lines 38-186)

## Symbols
| Symbol | Kind | Span | Exported |
|---|---|---|---|
| `RunExtractorOptions` | interface | 25-36 | yes |
| `finalize` | function | 188-217 | no |
| `runExtractor` | function | 38-186 | yes |

## Calls out
- `finalize` → [EntityState.close](/src/entities/state.md)
- `finalize` → [EntityState.writeRunSummary](/src/entities/state.md)
- `runExtractor` → [buildExtractionPrompt](/src/entities/prompt.md)
- `runExtractor` → [currentScope](/src/env.md)
- `runExtractor` → `finalize` (same file)
- `runExtractor` → [findCandidateMemories](/src/entities/db.md)
- `runExtractor` → [getTopEntitiesByFrequency](/src/entities/db.md)
- `runExtractor` → [EntityState.isMemoryTerminal](/src/entities/state.md)
- `runExtractor` → [linkMemoryToEntity](/src/entities/db.md)
- `runExtractor` → [normalizeEntityName](/src/entities/normalize.md)
- `runExtractor` → [parseExtractionResponse](/src/entities/prompt.md)
- `runExtractor` → [EntityState.recordParseFailed](/src/entities/state.md)
- `runExtractor` → [EntityState.recordTerminal](/src/entities/state.md)
- `runExtractor` → [upsertEntity](/src/entities/db.md)
- `runExtractor` → [withLLMCallSpan](/src/telemetry.md)

## Called by
- `main` in [src/cli/extract-entities.ts](/src/cli/extract-entities.md)
