---
type: Module
title: src/cli/migrate.ts
description: Skeleton concept for src/cli/migrate.ts (extracted; 5 symbols).
resource: src/cli/migrate.ts
enrichment: none
from: []
explains: []
stale: false
graph_hash: 77d367245d49ace6ef0672a008ab019becccb6dbdf36b1e5dba5e4679096f6d2
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
