---
type: Module
title: tests/entities/recall-entity-filter.test.ts
description: Skeleton concept for tests/entities/recall-entity-filter.test.ts
  (extracted; 1 symbols).
resource: tests/entities/recall-entity-filter.test.ts
tags:
  - tests
  - module
  - function
enrichment: accuracy-audited
from:
  - BACKFILL-r2mcp-13
explains:
  - tests/entities/recall-entity-filter.test.ts#seed3MemoriesWithSpeculator
stale: false
stale_reason: ""
graph_hash: 722abd60fe9a14221204daed15ffc79c1ccb916aa2f11bc37b8d327971cb1d46
---

# Structure

## Symbols
| Symbol | Kind | Span | Exported |
|---|---|---|---|
| `seed3MemoriesWithSpeculator` | function | 29-49 | no |

## Calls out
- `seed3MemoriesWithSpeculator` → [linkMemoryToEntity](/src/entities/db.md)
- `seed3MemoriesWithSpeculator` → [upsertEntity](/src/entities/db.md)

# Explanation
Documents the contract for `recall()`'s optional entity filter — the fixture shape (`seed3MemoriesWithSpeculator`, deliberately linking only 2 of 3 memories) is the reusable pattern for any future test needing "some things linked, some things not" rather than a trivial all-or-nothing fixture. A future reader extending `recall()`'s filtering (e.g. adding a second simultaneous entity filter, or a topic+entity combination) should look at the proper-subset test here as the template for how to prove an intersection is genuinely narrowing, not just non-empty.

# Decisions
- (BACKFILL-r2mcp-13) The entity-only fast path (`entityOnlySearch`) exists as a deliberate optimization: when there is no query text to rank against, computing an embedding and running semantic/fulltext scoring would be wasted work (and would need a placeholder score), so `recall()` special-cases `entity` set + empty/omitted `query` into a plain recency-ordered lookup. This means an entity-only recall result's `score` field is always `1.0` — a future reader should not interpret that as "perfect relevance," it is a sentinel value for "no ranking was performed." The "omitted query key" test exists as a distinct case from "empty string query" specifically because the MCP schema change that enabled entity-only recall (a Task 10 follow-up) needed to support callers who never send a `query` field at all, not just callers who send `query: ''` — both must hit the identical internal code path, and this test is what pins that equivalence.

# Citations
[1] BACKFILL-r2mcp-13 evidence: /Users/dustincheng/projects/claudeclaw/docs/specs/asbuilt-living-kb/evidence/backfill13-evidence.yml
