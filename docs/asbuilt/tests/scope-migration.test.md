---
type: Module
title: tests/scope-migration.test.ts
description: Skeleton concept for tests/scope-migration.test.ts (extracted; 2 symbols).
resource: tests/scope-migration.test.ts
tags:
  - tests
  - module
  - function
enrichment: accuracy-audited
from:
  - BACKFILL-r2mcp-11
explains:
  - tests/scope-migration.test.ts#simulatePreScopeSchema
  - tests/scope-migration.test.ts#uniqueConstraintColumns
stale: false
stale_reason: ""
graph_hash: 722abd60fe9a14221204daed15ffc79c1ccb916aa2f11bc37b8d327971cb1d46
---

# Structure

## Symbols
| Symbol | Kind | Span | Exported |
|---|---|---|---|
| `simulatePreScopeSchema` | function | 28-38 | no |
| `uniqueConstraintColumns` | function | 40-51 | no |

# Explanation
This suite is the safety net for the actual SQL migration file (src/migrations/001_baseline.sql) that will run against the live production database containing pre-scope legacy rows. A future reader editing that migration file — or writing a new migration that touches the memories/entities unique constraints — should run this suite before trusting the change, since it is written to catch exactly the failure modes a schema migration against live data with legacy rows can produce (NULL backfills, wrong constraint scope, non-idempotent DDL).

# Decisions
- (BACKFILL-r2mcp-11) The file reads SCHEMA_SQL directly off disk from src/migrations/001_baseline.sql rather than embedding a copy of the SQL inline, so the test always exercises the literal file that will run in production — a deliberate choice to avoid the classic "the test's copy of the migration drifted from the real one" failure mode. That file was renamed from schema.sql (claw-i6td.5); a reader searching for "schema.sql" in older code-review notes or commit messages should look for 001_baseline.sql instead. simulatePreScopeSchema() manually reverses the migration's DDL (drop composite constraint, drop column, restore legacy single-column constraint) rather than restoring from a snapshot of an old database — this was the pragmatic choice since no snapshot of the actual pre-migration production schema was preserved; a reader trusting this suite should understand it is validating "does the migration correctly handle a table shaped like the old one," not "does it correctly handle the literal historical production database." uniqueConstraintColumns() asserts against pg_constraint/pg_attribute directly instead of trying to query information_schema, specifically so it can compare column sets regardless of column ordering in the constraint definition (ordering is asserted as incidental via a sort before comparison).

# Citations
[1] BACKFILL-r2mcp-11 evidence: /Users/dustincheng/projects/claudeclaw/docs/specs/asbuilt-living-kb/evidence/backfill11-evidence.yml
