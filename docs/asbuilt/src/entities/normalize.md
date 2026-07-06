---
type: Module
title: src/entities/normalize.ts
description: Skeleton concept for src/entities/normalize.ts (extracted; 1 symbols).
resource: src/entities/normalize.ts
tags:
  - src
  - module
  - function
enrichment: accuracy-audited
from:
  - BACKFILL-r2mcp-07
explains:
  - src/entities/normalize.ts#normalizeEntityName
stale: false
stale_reason: ""
graph_hash: c192643d124600fd68491305707bec2b09c19febe0921e729af00e7c9e27905f
---

# Structure

## Exports
- `normalizeEntityName` (function, lines 5-7)

## Symbols
| Symbol | Kind | Span | Exported |
|---|---|---|---|
| `normalizeEntityName` | function | 5-7 | yes |

## Called by
- `findEntityByInput` in [src/entities/db.ts](/src/entities/db.md)
- `mergeAliases` in [src/entities/db.ts](/src/entities/db.md)
- `upsertEntity` in [src/entities/db.ts](/src/entities/db.md)
- `runExtractor` in [src/entities/extractor.ts](/src/entities/extractor.md)

# Explanation
normalizeEntityName is the single canonicalization function that everything in the entity system's identity model depends on: two names are 'the same entity' if and only if this function maps them to the same string. It exists as its own one-function file specifically so it can be imported without pulling in any DB or LLM dependencies — both db.ts (for persisted normalized_name/alias comparisons) and extractor.ts (for in-memory LLM-match resolution) need the exact same logic and must never drift apart.

# Decisions
- (BACKFILL-r2mcp-07) NFKC (compatibility decomposition + canonical composition) was chosen over the more common NFC specifically because compatibility normalization also collapses visually/semantically equivalent but code-point-different characters (e.g. full-width Latin letters, certain ligatures) that plain NFC would leave distinct — relevant because entity names in this system originate from free-form LLM output and user input, not a constrained input widget, so unusual Unicode variants are a realistic occurrence. The biggest gotcha for a future maintainer: normalized_name is PERSISTED as a column (see db.ts upsertEntity), not recomputed at query time from canonical_name — so if this function's logic ever changes (e.g. the whitespace-collapse regex, or swapping NFKC for something else), every existing row's stored normalized_name becomes stale relative to freshly-normalized input, and previously-matching aliases/names will silently stop resolving to the same entity until a backfill migration recomputes normalized_name for all existing rows — there is no such migration path today. The `/\s+/g` collapse step is necessary in addition to NFKC because Unicode normalization does not touch whitespace variety (tabs vs. multiple spaces vs. newlines) — without it, two names differing only in whitespace run-length would normalize to different strings and be treated as different entities.

# Citations
[1] BACKFILL-r2mcp-07 evidence: /Users/dustincheng/projects/claudeclaw/docs/specs/asbuilt-living-kb/evidence/backfill07-evidence.yml
