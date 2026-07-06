---
type: Test
title: tests/backup/export-import.test.ts
description: Skeleton concept for tests/backup/export-import.test.ts (extracted; 2 symbols).
resource: tests/backup/export-import.test.ts
tags:
  - tests
  - module
  - test
  - function
enrichment: accuracy-audited
from:
  - BACKFILL-r2mcp-11
explains:
  - tests/backup/export-import.test.ts#seedGraph
  - tests/backup/export-import.test.ts#wipeAll
stale: false
stale_reason: ""
graph_hash: c192643d124600fd68491305707bec2b09c19febe0921e729af00e7c9e27905f
---

# Structure

## Symbols
| Symbol | Kind | Span | Exported |
|---|---|---|---|
| `seedGraph` | function | 29-69 | no |
| `wipeAll` | function | 71-76 | no |

# Explanation
This is the contract test for ClaudeClaw's backup/restore format (claw-i6td.4) — a portable JSONL representation of the memories/entities graph. A future reader building any tool that consumes or produces this format (a migration tool, a cross-environment sync, a manual recovery script) should treat the header/row shape and FK-safe ordering pinned here as the wire contract, not an implementation detail of exporter.ts.

# Decisions
- (BACKFILL-r2mcp-11) FK-safe row ordering (parents before children) is a hard requirement because import applies rows in file order and depends on parent rows existing before child rows reference them by id — a future change to exportToLines that reorders rows (e.g. for a "group by table" cosmetic change) would silently break import unless it preserves this invariant, which is why the export-format test asserts ordering explicitly rather than just checking row presence. The generated tsv full-text-search column is deliberately excluded from export — it's derived from other columns by Postgres itself and re-derives automatically on insert, so shipping it would be both redundant and a portability risk if the tsv generation expression ever changes between versions. Import idempotency is achieved via per-table PK/unique-key conflict handling (counted as "skipped"), not content diffing — re-importing an export that has diverged from the live rows (e.g. a row was edited after export) will NOT update the existing row, it will just skip it as already-present; a future reader expecting "import" to mean "sync to match the file" needs to know this suite proves the opposite (idempotent-skip, not upsert). The "behind-version databases" test — verifying connectDb() works even with schema_migrations missing — encodes a specific product requirement: a backup tool must work BEFORE a deployment has ever run migrations, since that pre-adoption moment is exactly when an operator is most likely to want a safety-net backup.

# Citations
[1] BACKFILL-r2mcp-11 evidence: /Users/dustincheng/projects/claudeclaw/docs/specs/asbuilt-living-kb/evidence/backfill11-evidence.yml
