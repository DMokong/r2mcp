---
type: Module
title: src/backup/exporter.ts
description: Skeleton concept for src/backup/exporter.ts (extracted; 4 symbols).
resource: src/backup/exporter.ts
tags:
  - src
  - module
  - function
  - interface
  - type
enrichment: accuracy-audited
from:
  - BACKFILL-r2mcp-10
explains:
  - src/backup/exporter.ts#ExportHeader
  - src/backup/exporter.ts#ExportOptions
  - src/backup/exporter.ts#TableName
  - src/backup/exporter.ts#exportToLines
stale: false
stale_reason: ""
graph_hash: 722abd60fe9a14221204daed15ffc79c1ccb916aa2f11bc37b8d327971cb1d46
---

# Structure

## Exports
- `ExportHeader` (interface, lines 27-33)
- `ExportOptions` (interface, lines 22-25)
- `TableName` (type, lines 35-35)
- `exportToLines` (function, lines 45-119)

## Symbols
| Symbol | Kind | Span | Exported |
|---|---|---|---|
| `ExportHeader` | interface | 27-33 | yes |
| `ExportOptions` | interface | 22-25 | yes |
| `TableName` | type | 35-35 | yes |
| `exportToLines` | function | 45-119 | yes |

## Called by
- `main` in [src/cli/export-jsonl.ts](/src/cli/export-jsonl.md)

# Explanation
Produces the export half of r2mcp's JSONL backup format (claw-i6td.4): a header line followed by one JSON line per row across four tables, ordered so a fresh restore never trips a foreign key. Consumed by `npm run db:export` (src/cli/export-jsonl.ts) and replayed by `importer.ts`.

# Decisions
- (BACKFILL-r2mcp-10) Row order is deliberately "parents before children" — memories/entities are streamed before memory_edges/memory_entities — so `importer.ts` can insert lines in the exact order it reads them, with no buffering or two-pass logic, and never violate a foreign key on an empty target database. `embedding::text` is exported as pgvector's textual representation while the `tsv` full-text-search column is explicitly excluded because it's a Postgres `GENERATED` column — Postgres recomputes it on insert, so shipping it would be wasted bytes and a potential source of drift if the generation expression ever changes between export and import time. Default scope is "export everything" (an undefined `opts.scope` means no WHERE clause at all) — the inline comment calls out that a backup tool which silently drops scopes on a default invocation is a footgun, so narrowing to one scope is opt-in, not opt-out. `memory_edges` and `memory_entities` have no `project_scope` column of their own, so when a scope filter IS supplied, an edge/link is only included if BOTH of its endpoints belong to the requested scope — a cross-scope edge (which nothing in the schema structurally prevents) would be silently dropped by a scoped export rather than partially exported with a dangling endpoint; a future reader debugging a "missing edge after scoped restore" report should check this filter first. `exportToLines` deliberately takes a plain `pg.Pool` and returns a `string[]` rather than writing to a file or stream itself — the CLI layer owns whether that output goes to stdout or `--out=<file>`, which keeps this function testable without touching the filesystem.

# Citations
[1] BACKFILL-r2mcp-10 evidence: /Users/dustincheng/projects/claudeclaw/docs/specs/asbuilt-living-kb/evidence/backfill10-evidence.yml
