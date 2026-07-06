---
type: Module
title: src/env.ts
description: Skeleton concept for src/env.ts (extracted; 2 symbols).
resource: src/env.ts
tags:
  - src
  - module
  - function
enrichment: accuracy-audited
from:
  - BACKFILL-r2mcp-10
explains:
  - src/env.ts#currentScope
  - src/env.ts#loadEnvFile
stale: false
stale_reason: ""
graph_hash: c192643d124600fd68491305707bec2b09c19febe0921e729af00e7c9e27905f
---

# Structure

## Exports
- `currentScope` (function, lines 28-31)
- `loadEnvFile` (function, lines 33-50)

## Symbols
| Symbol | Kind | Span | Exported |
|---|---|---|---|
| `currentScope` | function | 28-31 | yes |
| `loadEnvFile` | function | 33-50 | yes |

## Called by
- `main` in [src/cli/classify-edges.ts](/src/cli/classify-edges.md)
- `loadMemoriesFromDb` in [src/cli/compile-wiki.ts](/src/cli/compile-wiki.md)
- `main` in [src/cli/compile-wiki.ts](/src/cli/compile-wiki.md)
- `main` in [src/cli/extract-entities.ts](/src/cli/extract-entities.md)
- `findCandidatePairs` in [src/edges/candidate-pairs.ts](/src/edges/candidate-pairs.md)
- `findCandidateMemories` in [src/entities/db.ts](/src/entities/db.md)
- `findEntityByInput` in [src/entities/db.ts](/src/entities/db.md)
- `getTopEntitiesByFrequency` in [src/entities/db.ts](/src/entities/db.md)
- `upsertEntity` in [src/entities/db.ts](/src/entities/db.md)
- `runExtractor` in [src/entities/extractor.ts](/src/entities/extractor.md)
- `findContradictions` in [src/lint/checks/contradictions.ts](/src/lint/checks/contradictions.md)
- `findDrift` in [src/lint/checks/drift.ts](/src/lint/checks/drift.md)
- `findOrphans` in [src/lint/checks/orphans.ts](/src/lint/checks/orphans.md)
- `findStale` in [src/lint/checks/stale.ts](/src/lint/checks/stale.md)
- `findSupersededUnflagged` in [src/lint/checks/superseded-unflagged.ts](/src/lint/checks/superseded-unflagged.md)
- `runLint` in [src/lint/run.ts](/src/lint/run.md)
- `meditate` in [src/tools/meditate.ts](/src/tools/meditate.md)
- `recall` in [src/tools/recall.ts](/src/tools/recall.md)
- `reject` in [src/tools/reject.ts](/src/tools/reject.md)
- `remember` in [src/tools/remember.ts](/src/tools/remember.md)
- `search` in [src/tools/search.ts](/src/tools/search.md)

# Explanation
Shared `.env` loader and project-scope resolver used by both the MCP server entrypoint and every CLI driver. It exists because MCP servers and launchd-spawned subprocesses do not inherit the invoking shell's environment, so each entrypoint has to load `.env` itself rather than relying on ambient `dotenv`-style loading in a parent shell process. `currentScope()` centralizes R2MCP_SCOPE resolution so every read/write call site can filter to a per-project bucket without re-implementing the trim-and-default logic itself.

# Decisions
- (BACKFILL-r2mcp-10) The parsing regex `/^([A-Za-z_][A-Za-z0-9_]*)=(.+)$/` deliberately replaces five earlier hand-rolled copies that used `/^([A-Z_]+)=/`, which could never match `R2MCP_*` keys because that pattern excludes digits — a real bug this consolidation fixed (claw-8cjf.1); a future reader touching this regex should double check it still matches every env var prefix in use, not just `R2MCP_*`. `loadEnvFile` never clobbers a var already present in `process.env` — this lets a real shell-exported value win over `.env` (useful in CI) and lets tests set env vars before importing modules without the loader stomping them. `DEFAULT_SCOPE = 'global'` MUST stay in sync with the `project_scope` column default in schema.sql (claw-nyxd.2) — if they drift, an unconfigured server starts reading/writing a different bucket than the one its existing rows were backfilled into; there is no automated check tying these two together, so a migration that changes the column default needs a matching manual change here. `currentScope()` reads `process.env.R2MCP_SCOPE` at call time rather than at module-load time specifically so CLI subprocesses that set the env var after importing this module still resolve correctly. `loadEnvFile` is only ever invoked from the `isMain` guard in CLI files and from `index.ts`'s top level — never at plain module-import time — because importing a module under test must not leak a real `R2MCP_DATABASE_URL` from a developer's local `.env` into the test process.

# Citations
[1] BACKFILL-r2mcp-10 evidence: /Users/dustincheng/projects/claudeclaw/docs/specs/asbuilt-living-kb/evidence/backfill10-evidence.yml
