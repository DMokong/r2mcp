---
type: Test
title: tests/test-db-guard.ts
description: Skeleton concept for tests/test-db-guard.ts (extracted; 3 symbols).
resource: tests/test-db-guard.ts
tags:
  - tests
  - module
  - test
  - function
enrichment: accuracy-audited
from:
  - BACKFILL-r2mcp-11
explains:
  - tests/test-db-guard.ts#enforceTestDbUrl
  - tests/test-db-guard.ts#isLocalHost
  - tests/test-db-guard.ts#pickTestUrl
stale: false
stale_reason: ""
graph_hash: c192643d124600fd68491305707bec2b09c19febe0921e729af00e7c9e27905f
---

# Structure

## Exports
- `enforceTestDbUrl` (function, lines 72-84)
- `pickTestUrl` (function, lines 25-62)

## Symbols
| Symbol | Kind | Span | Exported |
|---|---|---|---|
| `enforceTestDbUrl` | function | 72-84 | yes |
| `isLocalHost` | function | 21-23 | no |
| `pickTestUrl` | function | 25-62 | yes |

## Calls out
- `enforceTestDbUrl` → `pickTestUrl` (same file)
- `pickTestUrl` → `isLocalHost` (same file)

## Called by
- `setupEdgesTestDb` in [tests/edges/setup.ts](/tests/edges/setup.md)
- `setupTestDb` in [tests/setup.ts](/tests/setup.md)

# Explanation
This module exists purely to prevent tests from ever running against a production database. It is not a general-purpose env-parsing utility — every branch in pickTestUrl() and enforceTestDbUrl() exists because of a specific, named failure mode, and removing a branch to "simplify" this file would reopen that failure mode.

# Decisions
- (BACKFILL-r2mcp-11) Origin incident: claw-0vsn, 2026-05-09 — sourcing .env before `vitest run` let test setup DELETE FROM memories/memory_edges against production Supabase, destroying ~9 production memories and 72 edges. The fix escalated in two stages: pickTestUrl() (claw-0vsn) added the local-and-name-contains-"test" heuristic plus an explicit-override path gated by R2MCP_ALLOW_REMOTE_TEST_DB=1; enforceTestDbUrl() (claw-i6td.2) made the guard STRUCTURAL by registering as a vitest setupFile that runs before every test module and forcibly overrides R2MCP_DATABASE_URL process-wide, so even a test that reads the env var directly (bypassing setupTestDb entirely) cannot reach production. Deliberate asymmetry: in enforceTestDbUrl(), a pickTestUrl() failure does not propagate as a throw — it is caught and replaced with TEST_URL_DEFAULT plus a loud console.warn, because failing this hook would crash every single test file, whereas overriding with a safe local default lets the suite run (just without the config the developer thought they had). A future change here should preserve that asymmetry rather than "fixing" it to throw consistently — a throw in enforceTestDbUrl would be far more disruptive than the current warn-and-override.

# Citations
[1] BACKFILL-r2mcp-11 evidence: /Users/dustincheng/projects/claudeclaw/docs/specs/asbuilt-living-kb/evidence/backfill11-evidence.yml
