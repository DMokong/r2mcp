---
type: Module
title: src/backup/importer.ts
description: Skeleton concept for src/backup/importer.ts (extracted; 6 symbols).
resource: src/backup/importer.ts
tags:
  - src
  - module
  - function
  - interface
enrichment: accuracy-audited
from:
  - BACKFILL-r2mcp-10
explains:
  - src/backup/importer.ts#ImportOptions
  - src/backup/importer.ts#ImportSummary
  - src/backup/importer.ts#RowEnvelope
  - src/backup/importer.ts#TableCounts
  - src/backup/importer.ts#emptyCounts
  - src/backup/importer.ts#importFromLines
stale: false
stale_reason: ""
graph_hash: 722abd60fe9a14221204daed15ffc79c1ccb916aa2f11bc37b8d327971cb1d46
---

# Structure

## Exports
- `ImportOptions` (interface, lines 20-23)
- `ImportSummary` (interface, lines 31-36)
- `TableCounts` (interface, lines 25-29)
- `importFromLines` (function, lines 128-190)

## Symbols
| Symbol | Kind | Span | Exported |
|---|---|---|---|
| `ImportOptions` | interface | 20-23 | yes |
| `ImportSummary` | interface | 31-36 | yes |
| `RowEnvelope` | interface | 38-42 | no |
| `TableCounts` | interface | 25-29 | yes |
| `emptyCounts` | function | 119-126 | no |
| `importFromLines` | function | 128-190 | yes |

## Calls out
- `importFromLines` → `emptyCounts` (same file)

## Called by
- `main` in [src/cli/import-jsonl.ts](/src/cli/import-jsonl.md)

# Explanation
The restore half of the JSONL backup format — replays a file produced by `exporter.ts` back into the same four tables, in file order, with per-row idempotency and continue-on-error semantics so a restore drill tells you exactly what didn't land rather than dying partway through.

# Decisions
- (BACKFILL-r2mcp-10) Every table's insert SQL uses a targetless `ON CONFLICT DO NOTHING` rather than naming a specific conflict target — this is intentional so a single insert statement is protected by whichever unique constraint fires first: the primary key OR the table's business-key unique index (e.g. `(project_scope, fingerprint)` for memories, `(from_memory_id, to_memory_id, relation)` for edges, `(project_scope, type, normalized_name)` for entities, the link table's composite PK) — re-running the same export twice, or restoring into a database that already has some overlapping rows, is always safe. There is no wrapping transaction around the whole import — a partial restore is explicitly the intended behavior per the file's header comment, trading strict atomicity for "always tell you exactly which row failed and why" instead of an opaque all-or-nothing rollback that hides the failure point. `rowCount === 1` is used to distinguish "actually inserted" from "skipped due to conflict" (`rowCount === 0`) — this is the only signal available since the query has no `RETURNING` clause, relying on Postgres's documented behavior of reporting zero affected rows for a no-op `ON CONFLICT DO NOTHING`. `dryRun` short-circuits before ever calling `pool.query`, incrementing the same counter a real insert would use — a dry-run count is therefore an upper bound ("would insert up to N"), not a guarantee, since it cannot detect conflicts that would only be discoverable by actually attempting the insert. The header record is validated strictly (must be `kind === 'header'` on the first non-blank line, `version === 1`) and throws immediately rather than being added to the soft-error list — a missing or unrecognized header means the file isn't a valid export at all, categorically different from a single bad row inside an otherwise-valid file. Finally, `import-jsonl.ts` calls `initDb()` (the version-gated boot path) while `export-jsonl.ts` calls `connectDb()` (ungated) — you can back up a stale database, but restoring requires the schema to already be current; a future reader adding a new backup-related CLI should preserve this asymmetry rather than "simplifying" both to the same boot path.

# Citations
[1] BACKFILL-r2mcp-10 evidence: /Users/dustincheng/projects/claudeclaw/docs/specs/asbuilt-living-kb/evidence/backfill10-evidence.yml
