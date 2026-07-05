---
type: Module
title: tests/edges/setup.ts
description: Skeleton concept for tests/edges/setup.ts (extracted; 4 symbols).
resource: tests/edges/setup.ts
tags:
  - tests
  - module
  - function
enrichment: accuracy-audited
from:
  - BACKFILL-r2mcp-12
explains:
  - tests/edges/setup.ts#insertTestMemory
  - tests/edges/setup.ts#resetEdgesTestDb
  - tests/edges/setup.ts#setupEdgesTestDb
  - tests/edges/setup.ts#teardownEdgesTestDb
stale: false
stale_reason: ""
graph_hash: 722abd60fe9a14221204daed15ffc79c1ccb916aa2f11bc37b8d327971cb1d46
---

# Structure

## Exports
- `insertTestMemory` (function, lines 22-38)
- `resetEdgesTestDb` (function, lines 17-20)
- `setupEdgesTestDb` (function, lines 4-11)
- `teardownEdgesTestDb` (function, lines 13-15)

## Symbols
| Symbol | Kind | Span | Exported |
|---|---|---|---|
| `insertTestMemory` | function | 22-38 | yes |
| `resetEdgesTestDb` | function | 17-20 | yes |
| `setupEdgesTestDb` | function | 4-11 | yes |
| `teardownEdgesTestDb` | function | 13-15 | yes |

## Calls out
- `setupEdgesTestDb` → [getPool](/src/db.md)
- `setupEdgesTestDb` → [initDb](/src/db.md)
- `setupEdgesTestDb` → [pickTestUrl](/tests/test-db-guard.md)
- `teardownEdgesTestDb` → [closeDb](/src/db.md)

# Explanation
This is the shared fixture module (not a test itself) for every spec file under tests/edges/. It exists to give each edges test a clean, isolated Postgres schema without every test file re-implementing pool setup, teardown, and seeding.

# Decisions
- (BACKFILL-r2mcp-12) `setupEdgesTestDb` forces `R2MCP_DATABASE_URL` to `pickTestUrl()` (from tests/test-db-guard.ts) BEFORE calling `initDb()` — this ordering is load-bearing, not incidental: if `initDb()` ran first against whatever ambient URL was already set, the DELETE statements two lines later would wipe a real database. This module trusts test-db-guard.ts entirely rather than re-validating the URL itself, so a future reader modifying setup.ts should never bypass `pickTestUrl()` for a "quick" direct pool connection. `insertTestMemory`'s tier-from-type mapping (preference/rejection -> preferences, relationship -> conversations, else -> project-context) intentionally mirrors production tiering logic so edges tests exercise realistic tier/type combinations rather than an arbitrary tier for every row. The random `test-<rand>-<timestamp>` fingerprint exists purely to satisfy a uniqueness constraint on `fingerprint` under rapid inserts across parallel test files — it carries no semantic meaning of its own.

# Citations
[1] BACKFILL-r2mcp-12 evidence: /Users/dustincheng/projects/claudeclaw/docs/specs/asbuilt-living-kb/evidence/backfill12-evidence.yml
