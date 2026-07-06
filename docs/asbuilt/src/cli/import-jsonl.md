---
type: Module
title: src/cli/import-jsonl.ts
description: Skeleton concept for src/cli/import-jsonl.ts (extracted; 1 symbols).
resource: src/cli/import-jsonl.ts
tags:
  - src
  - module
  - function
enrichment: accuracy-audited
from:
  - BACKFILL-r2mcp-04
explains:
  - src/cli/import-jsonl.ts#main
stale: false
stale_reason: ""
graph_hash: c192643d124600fd68491305707bec2b09c19febe0921e729af00e7c9e27905f
---

# Structure

## Symbols
| Symbol | Kind | Span | Exported |
|---|---|---|---|
| `main` | function | 27-42 | no |

## Calls out
- `main` → [closeDb](/src/db.md)
- `main` → [getPool](/src/db.md)
- `main` → [importFromLines](/src/backup/importer.md)
- `main` → [initDb](/src/db.md)

# Explanation
The restore half of the export-jsonl.ts/import-jsonl.ts backup pair. A future reader restoring from a backup should read this alongside src/backup/importer.ts, which contains the actual per-table insert logic and idempotency guarantee this file's docstring relies on.

# Decisions
- (BACKFILL-r2mcp-04) Exiting 1 whenever `summary.errors.length > 0`, even though the restore otherwise 'completed' and printed a full JSON summary, is a deliberate choice to make partial restores visible to automation: a cron job or script driving `db:import` in a pipeline checks the exit code, not the JSON body, so a restore that skipped or failed some rows must not look identical (exit 0) to a fully clean restore. The importer's own idempotency (`ON CONFLICT DO NOTHING` on every insert) is what makes `db:import` safe to re-run after a partial failure without manually figuring out which rows already landed — a future reader adding a new table to the import path must preserve this `ON CONFLICT DO NOTHING` pattern or re-running a restore after a crash could produce duplicate rows for that table specifically. `--dry-run` parses and counts without writing, which is the only way to safely preview what a restore WOULD do against a target database before committing to it — useful specifically because imports are typically run against a DIFFERENT database than the one the export was taken from (disaster recovery, environment promotion), where 'what's already there' is not obvious ahead of time.

# Citations
[1] BACKFILL-r2mcp-04 evidence: /Users/dustincheng/projects/claudeclaw/docs/specs/asbuilt-living-kb/evidence/backfill04-evidence.yml
