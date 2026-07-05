---
type: Module
title: src/db.ts
description: Skeleton concept for src/db.ts (extracted; 4 symbols).
resource: src/db.ts
tags:
  - src
  - module
  - function
enrichment: accuracy-audited
from:
  - BACKFILL-r2mcp-02
explains:
  - src/db.ts#closeDb
  - src/db.ts#connectDb
  - src/db.ts#getPool
  - src/db.ts#initDb
stale: false
stale_reason: ""
graph_hash: 722abd60fe9a14221204daed15ffc79c1ccb916aa2f11bc37b8d327971cb1d46
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

# Explanation
db.ts is the single choke point for Postgres connectivity in the codebase — one lazily-constructed, module-level `pg.Pool`, shared by every tool, every CLI driver, and the tests (via `setupTestDb`-style helpers). Two boot paths exist for a reason: `connectDb()` only registers pgvector's vector type parser, while `initDb()` additionally gates on schema version. Anything that must tolerate a behind-version schema — chiefly `db:export`, so an operator can still take a backup right before running the migration that would otherwise refuse to boot — calls `connectDb()` directly; everything else calls `initDb()`.

# Decisions
- (BACKFILL-r2mcp-02) `getPool()` throws `MISSING_DATABASE_URL_MESSAGE` rather than falling back to a localhost default — a deliberate reversal (claw-8cjf.2) of an earlier design where an unset `R2MCP_DATABASE_URL` silently connected to a bare localhost Postgres, a DIFFERENT database from Docker's actual default (`r2mcp:r2mcp@localhost`), so writes landed in the wrong place with no error at all. Refusing to guess trades a confusing "why isn't this working" for a fast, explicit failure. `pgvector.registerTypes` requires a client, not a pool — `connectDb()` checks one out with `pool.connect()`, registers, and releases it in a `finally`; a future maintainer who tries `registerTypes(pool)` directly will hit a type mismatch. `initDb()` deliberately no longer executes DDL at runtime (claw-i6td.5) — an older version ran `schema.sql` on every boot, which required the runtime DB role to hold owner/DDL privileges (a security smell) and made non-additive migrations (renames, drops) unsafe, since two different running code versions could race to "fix up" the schema differently. `verifySchemaVersion()` (migrations.ts) is now read-only and fails fast pointing at `npm run setup`, the only path that calls `applyMigrations()`.

# Citations
[1] BACKFILL-r2mcp-02 evidence: /Users/dustincheng/projects/claudeclaw/docs/specs/asbuilt-living-kb/evidence/backfill02-evidence.yml
