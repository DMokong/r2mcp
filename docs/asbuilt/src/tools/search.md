---
type: Module
title: src/tools/search.ts
description: Skeleton concept for src/tools/search.ts (extracted; 5 symbols).
resource: src/tools/search.ts
tags:
  - src
  - module
  - function
  - interface
enrichment: accuracy-audited
from:
  - BACKFILL-r2mcp-03
explains:
  - src/tools/search.ts#SearchFilter
  - src/tools/search.ts#SearchInput
  - src/tools/search.ts#SearchResultEntry
  - src/tools/search.ts#search
stale: false
stale_reason: ""
graph_hash: 722abd60fe9a14221204daed15ffc79c1ccb916aa2f11bc37b8d327971cb1d46
---

# Structure

## Exports
- `SearchFilter` (interface, lines 4-11)
- `SearchInput` (interface, lines 13-19)
- `SearchResult` (interface, lines 34-37)
- `SearchResultEntry` (interface, lines 21-32)
- `search` (function, lines 39-125)

## Symbols
| Symbol | Kind | Span | Exported |
|---|---|---|---|
| `SearchFilter` | interface | 4-11 | yes |
| `SearchInput` | interface | 13-19 | yes |
| `SearchResult` | interface | 34-37 | yes |
| `SearchResultEntry` | interface | 21-32 | yes |
| `search` | function | 39-125 | yes |

## Calls out
- `search` → [currentScope](/src/env.md)
- `search` → [getPool](/src/db.md)

# Explanation
search() is the deterministic, filter-driven browsing tool — distinct from `recall()`'s semantic/hybrid ranking (which lives in recall.ts, not here). It builds a dynamic parameterized SQL WHERE clause from any combination of type/tier/topics/persons/date-range/full-text filters and simply orders by `created_at DESC`; there is no relevance scoring in this file at all.

# Decisions
- (BACKFILL-r2mcp-03) `type != 'rejection'` is hardcoded as the very first, unconditional filter clause. Combined with `reject.ts` also hardcoding `type = 'rejection'` on the reason-memory it inserts, this produces a concrete footgun: calling `search({filter: {type: 'rejection'}})` always returns zero rows, because the generated SQL becomes `type != 'rejection' AND type = 'rejection'`, which can never be satisfied. A future reader wanting to surface rejection reasons through this tool needs a different mechanism entirely (the hardcoded exclusion can't be overridden via `filter`). Scope handling mirrors reject.ts/meditate.ts's "current + global" pattern: unless `all_scopes` is set, results are restricted to `project_scope = ANY(Array.from(new Set([currentScope(), DEFAULT_SCOPE])))` — the `Set` dedupe is there purely so a deployment already scoped to `'global'` doesn't produce a redundant two-element array in the generated SQL, not because a duplicate would be incorrect.

# Citations
[1] BACKFILL-r2mcp-03 evidence: /Users/dustincheng/projects/claudeclaw/docs/specs/asbuilt-living-kb/evidence/backfill03-evidence.yml
