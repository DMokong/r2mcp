---
type: Module
title: src/cli/export-jsonl.ts
description: Skeleton concept for src/cli/export-jsonl.ts (extracted; 3 symbols).
resource: src/cli/export-jsonl.ts
tags:
  - src
  - module
  - function
  - interface
enrichment: accuracy-audited
from:
  - BACKFILL-r2mcp-04
explains:
  - src/cli/export-jsonl.ts#CliArgs
  - src/cli/export-jsonl.ts#main
  - src/cli/export-jsonl.ts#parseArgs
stale: false
stale_reason: ""
graph_hash: 722abd60fe9a14221204daed15ffc79c1ccb916aa2f11bc37b8d327971cb1d46
---

# Structure

## Symbols
| Symbol | Kind | Span | Exported |
|---|---|---|---|
| `CliArgs` | interface | 25-28 | no |
| `main` | function | 40-62 | no |
| `parseArgs` | function | 30-38 | no |

## Calls out
- `main` → [closeDb](/src/db.md)
- `main` → [connectDb](/src/db.md)
- `main` → [exportToLines](/src/backup/exporter.md)
- `main` → [getPool](/src/db.md)
- `main` → `parseArgs` (same file)
- `main` → [RunSummaryWriter.write](/src/edges/state.md)

# Explanation
export-jsonl.ts and import-jsonl.ts (claw-i6td.4) form the backup/restore pair for the whole memory database — a plain JSONL dump/replay mechanism independent of `pg_dump`, chosen so an export can be inspected, diffed, and even hand-edited as line-delimited JSON before being replayed elsewhere. A future reader should read this file together with src/backup/exporter.ts (the actual row-to-line serialization) and src/backup/importer.ts (the replay/idempotency logic) — this file is deliberately thin, just argument parsing and stdout/file routing.

# Decisions
- (BACKFILL-r2mcp-04) The choice of `connectDb()` over `initDb()` is the single most important design decision in this file and is called out explicitly in a comment: `initDb()` gates on schema version and refuses to boot against a database whose migrations are behind what the running code expects, but the single most common reason to run a backup is 'about to run a migration that might go wrong' — an export tool that itself refuses to run against a pre-migration database would defeat its own purpose. The header comment also documents that default coverage is ALL scopes (not just `currentScope()`), a deliberate asymmetry with classify-edges.ts and compile-wiki.ts, which always scope-restrict — a backup is meant to capture everything unless narrowed with `--scope`, since a partial backup that silently excluded other projects' data would be a dangerous default for a disaster-recovery tool. Output routing keeps the JSONL body on stdout and ALL summary/log text on stderr in both the `--out=file` and default-stdout paths — this is what makes `db:export | some-pipeline` safe; a future reader adding any new log line to `main()` must remember to write it to stderr, never stdout, or they will silently corrupt the JSONL stream for anyone piping it.

# Citations
[1] BACKFILL-r2mcp-04 evidence: /Users/dustincheng/projects/claudeclaw/docs/specs/asbuilt-living-kb/evidence/backfill04-evidence.yml
