---
type: Module
title: src/db.ts
description: Skeleton concept for src/db.ts (extracted; 4 symbols).
resource: src/db.ts
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
- `closeDb` (function, lines 60-65)
- `connectDb` (function, lines 36-46)
- `getPool` (function, lines 19-28)
- `initDb` (function, lines 55-58)

## Symbols
| Symbol | Kind | Span | Exported |
|---|---|---|---|
| `closeDb` | function | 60-65 | yes |
| `connectDb` | function | 36-46 | yes |
| `getPool` | function | 19-28 | yes |
| `initDb` | function | 55-58 | yes |

## Calls out
- `connectDb` → `getPool` (same file)
- `connectDb` → [Semaphore.release](/src/providers/semaphore.md)
- `initDb` → `connectDb` (same file)
- `initDb` → `getPool` (same file)
- `initDb` → [verifySchemaVersion](/src/migrations.md)

## Called by
- `main` in [src/cli/classify-edges.ts](/src/cli/classify-edges.md)
- `main` in [src/cli/classify-edges.ts](/src/cli/classify-edges.md)
- `main` in [src/cli/classify-edges.ts](/src/cli/classify-edges.md)
- `loadMemoriesFromDb` in [src/cli/compile-wiki.ts](/src/cli/compile-wiki.md)
- `main` in [src/cli/compile-wiki.ts](/src/cli/compile-wiki.md)
- `main` in [src/cli/compile-wiki.ts](/src/cli/compile-wiki.md)
- `main` in [src/cli/export-jsonl.ts](/src/cli/export-jsonl.md)
- `main` in [src/cli/export-jsonl.ts](/src/cli/export-jsonl.md)
- `main` in [src/cli/export-jsonl.ts](/src/cli/export-jsonl.md)
- `main` in [src/cli/extract-entities.ts](/src/cli/extract-entities.md)
- `main` in [src/cli/extract-entities.ts](/src/cli/extract-entities.md)
- `main` in [src/cli/extract-entities.ts](/src/cli/extract-entities.md)
- `main` in [src/cli/import-jsonl.ts](/src/cli/import-jsonl.md)
- `main` in [src/cli/import-jsonl.ts](/src/cli/import-jsonl.md)
- `main` in [src/cli/import-jsonl.ts](/src/cli/import-jsonl.md)
- `main` in [src/cli/lint-memory.ts](/src/cli/lint-memory.md)
- `main` in [src/cli/lint-memory.ts](/src/cli/lint-memory.md)
- `main` in [src/cli/lint-memory.ts](/src/cli/lint-memory.md)
- `migrate` in [src/cli/migrate.ts](/src/cli/migrate.md)
- `migrate` in [src/cli/migrate.ts](/src/cli/migrate.md)
- `main` in [src/index.ts](/src/index.ts.md)
- `lint` in [src/tools/lint.ts](/src/tools/lint.md)
- `meditate` in [src/tools/meditate.ts](/src/tools/meditate.md)
- `recall` in [src/tools/recall.ts](/src/tools/recall.md)
- `reject` in [src/tools/reject.ts](/src/tools/reject.md)
- `remember` in [src/tools/remember.ts](/src/tools/remember.md)
- `search` in [src/tools/search.ts](/src/tools/search.md)
- `stats` in [src/tools/stats.ts](/src/tools/stats.md)
- `setupEdgesTestDb` in [tests/edges/setup.ts](/tests/edges/setup.md)
- `setupEdgesTestDb` in [tests/edges/setup.ts](/tests/edges/setup.md)
- `teardownEdgesTestDb` in [tests/edges/setup.ts](/tests/edges/setup.md)
- `setupTestDb` in [tests/setup.ts](/tests/setup.md)
- `setupTestDb` in [tests/setup.ts](/tests/setup.md)
- `teardownTestDb` in [tests/setup.ts](/tests/setup.md)
