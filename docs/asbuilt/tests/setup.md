---
type: Module
title: tests/setup.ts
description: Skeleton concept for tests/setup.ts (extracted; 2 symbols).
resource: tests/setup.ts
tags:
  - tests
  - module
  - function
enrichment: accuracy-audited
from:
  - BACKFILL-r2mcp-11
explains:
  - tests/setup.ts#setupTestDb
  - tests/setup.ts#teardownTestDb
stale: false
stale_reason: ""
graph_hash: 722abd60fe9a14221204daed15ffc79c1ccb916aa2f11bc37b8d327971cb1d46
---

# Structure

## Exports
- `setupTestDb` (function, lines 5-14)
- `teardownTestDb` (function, lines 16-18)

## Symbols
| Symbol | Kind | Span | Exported |
|---|---|---|---|
| `setupTestDb` | function | 5-14 | yes |
| `teardownTestDb` | function | 16-18 | yes |

## Calls out
- `setupTestDb` → [applyMigrations](/src/migrations.md)
- `setupTestDb` → [getPool](/src/db.md)
- `setupTestDb` → [initDb](/src/db.md)
- `setupTestDb` → [pickTestUrl](/tests/test-db-guard.md)
- `teardownTestDb` → [closeDb](/src/db.md)

# Explanation
tests/setup.ts is the standard per-file database fixture: setupTestDb() wired into a vitest beforeAll, teardownTestDb() into afterAll. A future reader adding a new integration test file should call these rather than hand-rolling pool setup, both because it routes through the same test-isolation guard as every other suite and because it exercises the production boot path (migrations + initDb) so a broken schema fails loudly during test setup instead of producing confusing assertion failures deep in a test body.

# Decisions
- (BACKFILL-r2mcp-11) setupTestDb() deliberately re-runs applyMigrations() and initDb() on every single test file rather than assuming a pre-migrated DB, on the theory that pending-only migrations are cheap when already current and the redundancy buys safety against schema drift between test runs. It only wipes the `memories` table, not `memory_edges`/`entities`/ `memory_entities` — suites that touch those tables own their own additional cleanup in a local beforeEach (see tests/backup/export-import.md and tests/breadcrumbs-real-handlers.md). A reader who forgets this and assumes setupTestDb() gives a fully clean slate across all tables will see edge/entity rows leak between test files that don't explicitly wipe them.

# Citations
[1] BACKFILL-r2mcp-11 evidence: /Users/dustincheng/projects/claudeclaw/docs/specs/asbuilt-living-kb/evidence/backfill11-evidence.yml
