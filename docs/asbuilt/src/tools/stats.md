---
type: Module
title: src/tools/stats.ts
description: Skeleton concept for src/tools/stats.ts (extracted; 2 symbols).
resource: src/tools/stats.ts
tags:
  - src
  - module
  - function
  - interface
enrichment: accuracy-audited
from:
  - BACKFILL-r2mcp-03
explains:
  - src/tools/stats.ts#StatsResult
  - src/tools/stats.ts#stats
stale: false
stale_reason: ""
graph_hash: c192643d124600fd68491305707bec2b09c19febe0921e729af00e7c9e27905f
---

# Structure

## Exports
- `StatsResult` (interface, lines 3-29)
- `stats` (function, lines 31-136)

## Symbols
| Symbol | Kind | Span | Exported |
|---|---|---|---|
| `StatsResult` | interface | 3-29 | yes |
| `stats` | function | 31-136 | yes |

## Calls out
- `stats` → [getPool](/src/db.md)

# Explanation
stats() is a single read-only reporting function with no input parameters at all — unlike every other tool in this batch — that always summarizes the entire `memories` table as visible to the current pool connection: totals, per-tier and per-type breakdowns, staleness/average age, top-10 topics, and embedding coverage, run as six independent queries via `Promise.all`.

# Decisions
- (BACKFILL-r2mcp-03) None of the six queries filter by `project_scope`, unlike search/reject/meditate/lint, which all scope-restrict — in a multi-project (`R2MCP_SCOPE`) deployment, `stats()` reports global totals across every project sharing the database, not a per-project view. A future reader making stats scope-aware needs to audit and modify all six independent SQL strings, since unlike search.ts's single dynamic `conditions` array, these queries share no common WHERE builder. `by_tier`/`by_type` are deliberately fixed-shape objects (three known tiers, six known types) built by defaulting any missing key to `0`, so a caller can always destructure e.g. `result.by_tier.preferences` without an existence check — the tradeoff is that this file is the one place that must be updated if a new tier or type is ever added to the schema. The `model: 'openai/text-embedding-3-small'` field in the response is a hardcoded string literal, not read from wherever the real embedding model is configured (`src/embeddings.ts`) — if that model is ever changed, this label goes stale silently rather than reflecting reality.

# Citations
[1] BACKFILL-r2mcp-03 evidence: /Users/dustincheng/projects/claudeclaw/docs/specs/asbuilt-living-kb/evidence/backfill03-evidence.yml
