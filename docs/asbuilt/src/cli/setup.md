---
type: Module
title: src/cli/setup.ts
description: Skeleton concept for src/cli/setup.ts (extracted; 1 symbols).
resource: src/cli/setup.ts
tags:
  - src
  - module
  - function
enrichment: accuracy-audited
from:
  - BACKFILL-r2mcp-04
explains:
  - src/cli/setup.ts#setup
stale: false
stale_reason: ""
graph_hash: 722abd60fe9a14221204daed15ffc79c1ccb916aa2f11bc37b8d327971cb1d46
---

# Structure

## Symbols
| Symbol | Kind | Span | Exported |
|---|---|---|---|
| `setup` | function | 39-108 | no |

## Calls out
- `setup` → [applyMigrations](/src/migrations.md)
- `setup` → [exit](/src/index.ts.md)
- `setup` → [redactDatabaseUrl](/src/cli/setup-helpers.md)
- `setup` → [Semaphore.release](/src/providers/semaphore.md)
- `setup` → [validateDatabaseUrl](/src/cli/setup-helpers.md)

# Explanation
setup.ts is the ONE-TIME (per environment)/idempotent schema provisioner an operator runs after pointing r2mcp at a fresh or existing Postgres database — `npm run setup`. It is deliberately separate from the runtime boot path (`src/db.ts#initDb`): initDb only ever VERIFIES the schema is at the expected version and refuses to run DDL, so setup.ts is the only code path in the entire codebase authorized to create the pgvector extension or apply migrations.

# Decisions
- (BACKFILL-r2mcp-04) setup.ts opens its own standalone `pg.Pool` rather than using the shared one from `src/db.ts#getPool` — this is necessary, not incidental: `getPool()`/`initDb()` assume a schema that already exists at the expected version, which is exactly the thing setup.ts is trying to CREATE on a fresh database, so reusing the shared pool's boot path would be circular. The pooler-port check (`validateDatabaseUrl` rejecting port 6543) exists because Supabase's transaction pooler cannot support prepared statements or DDL at all — this isn't a soft preference, a transaction-pooler connection will hard-fail partway through migrations in a way that's confusing to debug from the DDL error alone, so the check front-loads a clear, actionable error before any schema work is attempted. `applyMigrations` being advisory-locked (`pg_advisory_lock` on a stable app-wide key) protects against the specific race of two operators (or a CI job and a human) running `npm run setup` against the same database at the same time — without the lock, two concurrent appliers could both see the same 'pending' migration and attempt to apply it twice. The sanity-check query at the end (verifying the `memories` table and index count) exists because a migration can technically 'complete' (no thrown error) while still leaving a broken schema behind if a migration file itself has a silent bug — this is a last line of defense specifically calling that scenario out by name in its error message rather than trusting `applyMigrations`'s own success signal alone.

# Citations
[1] BACKFILL-r2mcp-04 evidence: /Users/dustincheng/projects/claudeclaw/docs/specs/asbuilt-living-kb/evidence/backfill04-evidence.yml
