---
type: Module
title: src/migrations.ts
description: Skeleton concept for src/migrations.ts (extracted; 7 symbols).
resource: src/migrations.ts
tags:
  - src
  - module
  - function
  - interface
enrichment: accuracy-audited
from:
  - BACKFILL-r2mcp-10
explains:
  - src/migrations.ts#ApplyResult
  - src/migrations.ts#Migration
  - src/migrations.ts#appliedVersion
  - src/migrations.ts#applyMigrations
  - src/migrations.ts#expectedSchemaVersion
  - src/migrations.ts#listMigrations
  - src/migrations.ts#verifySchemaVersion
stale: false
stale_reason: ""
graph_hash: 722abd60fe9a14221204daed15ffc79c1ccb916aa2f11bc37b8d327971cb1d46
---

# Structure

## Exports
- `ApplyResult` (interface, lines 37-41)
- `Migration` (interface, lines 30-35)
- `appliedVersion` (function, lines 83-90)
- `applyMigrations` (function, lines 97-139)
- `expectedSchemaVersion` (function, lines 77-80)
- `listMigrations` (function, lines 48-74)
- `verifySchemaVersion` (function, lines 146-160)

## Symbols
| Symbol | Kind | Span | Exported |
|---|---|---|---|
| `ApplyResult` | interface | 37-41 | yes |
| `Migration` | interface | 30-35 | yes |
| `appliedVersion` | function | 83-90 | yes |
| `applyMigrations` | function | 97-139 | yes |
| `expectedSchemaVersion` | function | 77-80 | yes |
| `listMigrations` | function | 48-74 | yes |
| `verifySchemaVersion` | function | 146-160 | yes |

## Calls out
- `applyMigrations` → `listMigrations` (same file)
- `applyMigrations` → [Semaphore.release](/src/providers/semaphore.md)
- `expectedSchemaVersion` → `listMigrations` (same file)
- `verifySchemaVersion` → `appliedVersion` (same file)
- `verifySchemaVersion` → `expectedSchemaVersion` (same file)

## Called by
- `setup` in [src/cli/setup.ts](/src/cli/setup.md)
- `initDb` in [src/db.ts](/src/db.md)
- `setupTestDb` in [tests/setup.ts](/tests/setup.md)

# Explanation
The versioned schema-migration system that replaced a single monolithic `schema.sql` (claw-i6td.5). Migrations live as `src/migrations/NNN_name.sql`, applied by `applyMigrations` (the DDL writer) and gated by `verifySchemaVersion` (a read-only boot check). The split exists so every runtime boot path (MCP server plus every CLI) can refuse to run against a stale schema without needing DDL-execution privileges at runtime — only `npm run setup` needs elevated database permissions.

# Decisions
- (BACKFILL-r2mcp-10) `001_baseline.sql` is literally the old `schema.sql`, made fully idempotent, so a pre-migration production database "adopts" the migration system for free: running `applyMigrations` against it just records version 1 as a no-op apply rather than re-running DDL that already exists. `listMigrations` intentionally throws rather than skip-and-continue on any anomaly (bad filename, duplicate version, gap in the sequence) — a missing migration file in a packaged build is exactly the kind of silent failure that corrupts a database quietly, so refusing to guess forces the operator to notice at setup time instead of at some unrelated runtime failure later. `verifySchemaVersion` treats "database is AHEAD of expected" as a hard error, not merely "behind" — this protects against running an older r2mcp binary against a newer schema (e.g. an app rollback without a matching DB rollback), which could otherwise silently write data in a way the newer schema no longer expects. `applyMigrations` takes a Postgres advisory lock (`pg_advisory_lock`, key `0x72326d63` = ASCII 'r2mc') using a single held client (`pool.connect()`, not the pool itself) for the entire apply — advisory locks are session-scoped, so lock and unlock must happen on the same connection; using `pool.query` for the lock/unlock pair instead would risk them landing on different pooled connections and never actually serializing concurrent `npm run setup` runs. Each migration runs in its own transaction rather than all pending migrations sharing one — a failure partway through leaves earlier migrations in that run committed, favoring "know exactly which migration broke and where you are" over strict all-or-nothing atomicity across files. Finally, `initDb()` (src/db.ts) always calls `verifySchemaVersion` but `connectDb()` does not — that split matters because `db:export` deliberately uses `connectDb` (see backup/exporter.md) so backups still work against a behind-version database right before an upgrade, which is exactly when a backup is most needed.

# Citations
[1] BACKFILL-r2mcp-10 evidence: /Users/dustincheng/projects/claudeclaw/docs/specs/asbuilt-living-kb/evidence/backfill10-evidence.yml
