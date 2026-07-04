---
type: Module
title: src/cli/classify-edges.ts
description: Skeleton concept for src/cli/classify-edges.ts (extracted; 3 symbols).
resource: src/cli/classify-edges.ts
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

## Symbols
| Symbol | Kind | Span | Exported |
|---|---|---|---|
| `CliArgs` | interface | 55-61 | no |
| `main` | function | 88-160 | no |
| `parseArgs` | function | 63-86 | no |

## Calls out
- `main` → [closeDb](/src/db.md)
- `main` → [currentScope](/src/env.md)
- `main` → [exit](/src/index.ts.md)
- `main` → [findCandidatePairs](/src/edges/candidate-pairs.md)
- `main` → [getPool](/src/db.md)
- `main` → [initDb](/src/db.md)
- `main` → `parseArgs` (same file)
- `main` → [runClassifier](/src/edges/classifier.md)
- `main` → [selectProvider](/src/providers/index.ts.md)
- `main` → [stage1HaikuFilter](/src/edges/stage1-haiku.md)
- `main` → [stage2OpusClassify](/src/edges/stage2-opus.md)
- `main` → [withToolSpan](/src/telemetry.md)
- `main` → [RunSummaryWriter.write](/src/edges/state.md)
- `parseArgs` → [isProviderName](/src/providers/index.ts.md)
