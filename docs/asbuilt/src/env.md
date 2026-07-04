---
type: Module
title: src/env.ts
description: Skeleton concept for src/env.ts (extracted; 2 symbols).
resource: src/env.ts
tags:
  - src
  - module
  - function
enrichment: none
from: []
explains: []
stale: false
stale_reason: ""
graph_hash: f3062700a89bb65b1df9622f69f7f24581224e0a7462079dc9cdb4a2395643c0
---

# Structure

## Exports
- `currentScope` (function, lines 28-31)
- `loadEnvFile` (function, lines 33-50)

## Symbols
| Symbol | Kind | Span | Exported |
|---|---|---|---|
| `currentScope` | function | 28-31 | yes |
| `loadEnvFile` | function | 33-50 | yes |

## Called by
- `main` in [src/cli/classify-edges.ts](/src/cli/classify-edges.md)
- `loadMemoriesFromDb` in [src/cli/compile-wiki.ts](/src/cli/compile-wiki.md)
- `main` in [src/cli/compile-wiki.ts](/src/cli/compile-wiki.md)
- `main` in [src/cli/extract-entities.ts](/src/cli/extract-entities.md)
- `findCandidatePairs` in [src/edges/candidate-pairs.ts](/src/edges/candidate-pairs.md)
- `findCandidateMemories` in [src/entities/db.ts](/src/entities/db.md)
- `findEntityByInput` in [src/entities/db.ts](/src/entities/db.md)
- `getTopEntitiesByFrequency` in [src/entities/db.ts](/src/entities/db.md)
- `upsertEntity` in [src/entities/db.ts](/src/entities/db.md)
- `runExtractor` in [src/entities/extractor.ts](/src/entities/extractor.md)
- `findContradictions` in [src/lint/checks/contradictions.ts](/src/lint/checks/contradictions.md)
- `findDrift` in [src/lint/checks/drift.ts](/src/lint/checks/drift.md)
- `findOrphans` in [src/lint/checks/orphans.ts](/src/lint/checks/orphans.md)
- `findStale` in [src/lint/checks/stale.ts](/src/lint/checks/stale.md)
- `findSupersededUnflagged` in [src/lint/checks/superseded-unflagged.ts](/src/lint/checks/superseded-unflagged.md)
- `runLint` in [src/lint/run.ts](/src/lint/run.md)
- `meditate` in [src/tools/meditate.ts](/src/tools/meditate.md)
- `recall` in [src/tools/recall.ts](/src/tools/recall.md)
- `reject` in [src/tools/reject.ts](/src/tools/reject.md)
- `remember` in [src/tools/remember.ts](/src/tools/remember.md)
- `search` in [src/tools/search.ts](/src/tools/search.md)
