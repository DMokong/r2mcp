---
type: Module
title: src/fingerprint.ts
description: Skeleton concept for src/fingerprint.ts (extracted; 2 symbols).
resource: src/fingerprint.ts
tags:
  - src
  - module
  - function
enrichment: accuracy-audited
from:
  - BACKFILL-r2mcp-10
explains:
  - src/fingerprint.ts#fingerprint
  - src/fingerprint.ts#normalizeContent
stale: false
stale_reason: ""
graph_hash: c192643d124600fd68491305707bec2b09c19febe0921e729af00e7c9e27905f
---

# Structure

## Exports
- `fingerprint` (function, lines 11-14)
- `normalizeContent` (function, lines 3-9)

## Symbols
| Symbol | Kind | Span | Exported |
|---|---|---|---|
| `fingerprint` | function | 11-14 | yes |
| `normalizeContent` | function | 3-9 | yes |

## Calls out
- `fingerprint` → `normalizeContent` (same file)

## Called by
- `reject` in [src/tools/reject.ts](/src/tools/reject.md)
- `remember` in [src/tools/remember.ts](/src/tools/remember.md)

# Explanation
Content-based deduplication key for memories. `remember` and `reject` both hash the normalized text of an incoming memory/rejection so a near-duplicate re-insertion collides on a stored fingerprint (via a `(project_scope, fingerprint)` uniqueness rule) instead of creating a second row for the same underlying insight.

# Decisions
- (BACKFILL-r2mcp-10) `normalizeContent` strips two specific things before hashing: HTML comments (the inline `<!-- type:... -->` metadata format used by legacy Direct-Mode writes) and `[see also: ...]` cross-reference annotations — both are considered presentational rather than part of the memory's actual content, so two memories differing only in their metadata comment or cross-reference list correctly dedup as the same insight. Whitespace is collapsed to single spaces and trimmed, so pure formatting differences (extra blank lines, trailing spaces) don't produce different fingerprints. The hashing algorithm is SHA-256 over the normalized string — a stable, dependency-light choice (Node's `node:crypto`) with no cross-language ambiguity; any future non-Node tool that needs to reproduce a fingerprint just has to replicate `normalizeContent`'s exact regex sequence and hash the result the same way, so changing the normalization rules is a breaking change for anything computing fingerprints externally. Gotcha for a future reader: fingerprinting ignores everything except `content` — two memories with identical text but different `tier`/`type`/`topics` will still collide as duplicates, which is by design but easy to forget when debugging an unexpected "already exists" dedup hit.

# Citations
[1] BACKFILL-r2mcp-10 evidence: /Users/dustincheng/projects/claudeclaw/docs/specs/asbuilt-living-kb/evidence/backfill10-evidence.yml
