---
type: Module
title: src/cli/setup-helpers.ts
description: Skeleton concept for src/cli/setup-helpers.ts (extracted; 4 symbols).
resource: src/cli/setup-helpers.ts
tags:
  - src
  - module
  - function
  - type
enrichment: accuracy-audited
from:
  - BACKFILL-r2mcp-04
explains:
  - src/cli/setup-helpers.ts#SetupErrorClassification
  - src/cli/setup-helpers.ts#classifySetupError
  - src/cli/setup-helpers.ts#redactDatabaseUrl
  - src/cli/setup-helpers.ts#validateDatabaseUrl
stale: false
stale_reason: ""
graph_hash: 722abd60fe9a14221204daed15ffc79c1ccb916aa2f11bc37b8d327971cb1d46
---

# Structure

## Exports
- `SetupErrorClassification` (type, lines 27-30)
- `classifySetupError` (function, lines 32-96)
- `redactDatabaseUrl` (function, lines 1-3)
- `validateDatabaseUrl` (function, lines 5-25)

## Symbols
| Symbol | Kind | Span | Exported |
|---|---|---|---|
| `SetupErrorClassification` | type | 27-30 | yes |
| `classifySetupError` | function | 32-96 | yes |
| `redactDatabaseUrl` | function | 1-3 | yes |
| `validateDatabaseUrl` | function | 5-25 | yes |

## Called by
- `setup` in [src/cli/setup.ts](/src/cli/setup.md)
- `setup` in [src/cli/setup.ts](/src/cli/setup.md)

# Explanation
A pure-function grab-bag deliberately split out of setup.ts for one reason: none of these functions touch a database connection, so they can be exercised directly by unit tests without spinning up Postgres. A future reader extending setup.ts's error handling (a new failure mode, a new hosting provider's quirks) should add a new branch here, in `classifySetupError`, rather than growing the try/catch inline in setup.ts's `.catch()` handler.

# Decisions
- (BACKFILL-r2mcp-04) `classifySetupError` matches on lower-cased substring checks against `err.message` AND `NodeJS.ErrnoException` codes (`ECONNREFUSED`, `ENETUNREACH`, `ETIMEDOUT`, `ENOTFOUND`) rather than a single canonical signal, because the underlying `pg` driver and Node's own network stack don't consistently surface the same identifying information for the same real-world failure — some come through as a typed error code, others only as freeform message text, so the function checks both to avoid missing a classification. Every branch returns a `fix` string written as a literal, copy-pasteable instruction (dashboard click-paths, exact connection string shapes, `docker compose up -d`) rather than a generic pointer to documentation — this is a deliberate choice given the target audience: someone running `npm run setup` for the first time on a fresh clone, often without deep Postgres/Supabase familiarity, who needs the NEXT action spelled out rather than a category name for the problem. The `ENETUNREACH` branch specifically calls out Supabase's direct connection resolving to an IPv6-only address as a known trap (IPv4 for direct connections is a paid add-on on Supabase) and recommends the session pooler as the IPv4-compatible fix — this is institutional knowledge about a specific hosting provider's networking quirk that would otherwise require an operator to discover it themselves via a cryptic `ENETUNREACH` stack trace with no obvious connection to 'my database provider defaults to IPv6.'

# Citations
[1] BACKFILL-r2mcp-04 evidence: /Users/dustincheng/projects/claudeclaw/docs/specs/asbuilt-living-kb/evidence/backfill04-evidence.yml
