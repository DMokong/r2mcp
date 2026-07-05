---
type: Module
title: src/cli/migrate.ts
description: Skeleton concept for src/cli/migrate.ts (extracted; 5 symbols).
resource: src/cli/migrate.ts
tags:
  - src
  - module
  - function
  - interface
enrichment: accuracy-audited
from:
  - BACKFILL-r2mcp-04
explains:
  - src/cli/migrate.ts#ParsedEntry
  - src/cli/migrate.ts#flushEntry
  - src/cli/migrate.ts#migrate
  - src/cli/migrate.ts#parseInlineMetadata
  - src/cli/migrate.ts#parseMarkdownEntries
stale: false
stale_reason: ""
graph_hash: 722abd60fe9a14221204daed15ffc79c1ccb916aa2f11bc37b8d327971cb1d46
---

# Structure

## Exports
- `ParsedEntry` (interface, lines 19-23)
- `flushEntry` (function, lines 58-73)
- `parseMarkdownEntries` (function, lines 48-96)

## Symbols
| Symbol | Kind | Span | Exported |
|---|---|---|---|
| `ParsedEntry` | interface | 19-23 | yes |
| `flushEntry` | function | 58-73 | yes |
| `migrate` | function | 98-146 | no |
| `parseInlineMetadata` | function | 31-46 | no |
| `parseMarkdownEntries` | function | 48-96 | yes |

## Calls out
- `flushEntry` → `parseInlineMetadata` (same file)
- `migrate` → [closeDb](/src/db.md)
- `migrate` → [initDb](/src/db.md)
- `migrate` → `parseMarkdownEntries` (same file)
- `migrate` → [remember](/src/tools/remember.md)
- `parseMarkdownEntries` → `flushEntry` (same file)
- `parseMarkdownEntries` → `parseInlineMetadata` (same file)

# Explanation
A one-time (but safely re-runnable) importer that bridges the OLD tiered-markdown memory format (`preferences.md`, `project-context.md`, `conversations.md` with inline `<!-- type:x topics:a,b -->` HTML-comment metadata) into the current Postgres-backed memory store. A future reader will most likely encounter this file either while onboarding a legacy project that still has hand-maintained tier markdown, or while archaeology-ing why a particular memory's `type`/`topics` look the way they do — trace it back to the exact inline-comment convention `parseInlineMetadata` implements.

# Decisions
- (BACKFILL-r2mcp-04) The markdown parser is intentionally a small hand-rolled state machine (section header / bullet-start / indented-continuation / blank-line) rather than a full markdown parser, because the tier files were always written by hand following one narrow convention (a `##` section, then flat `- ` bullets with optional indented continuation lines) — pulling in a general markdown AST parser would be solving a much bigger problem than this format actually poses, and would need its own translation layer back to this exact bullet-per-entry model anyway. Re-running `migrate` against the same files is safe NOT because this script has its own dedup logic, but because it reuses `remember()`'s ADD-path fingerprint dedup (per project scope) — this script has zero awareness of whether an entry was migrated before; it just calls ADD every time and trusts the downstream dedup. This is a deliberate reuse of an existing invariant rather than a parallel dedup mechanism, but it also means a future reader must not assume migrate.ts is idempotent on its own merits — if `remember()`'s dedup logic ever changed to be non-per-scope, or fingerprinting changed algorithm, re-running an old migrate against files already imported under the old fingerprint scheme could silently re-add everything as 'new' entries. Per-entry try/catch means one malformed or DB-rejected entry (e.g. an embedding call failure) does not abort the whole migration — the trade-off is that a partially failed migration reports its error count but still requires a human to read the `Error:` lines to know which specific entries to hand-fix and re-run.

# Citations
[1] BACKFILL-r2mcp-04 evidence: /Users/dustincheng/projects/claudeclaw/docs/specs/asbuilt-living-kb/evidence/backfill04-evidence.yml
