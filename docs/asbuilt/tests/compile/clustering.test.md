---
type: Test
title: tests/compile/clustering.test.ts
description: Skeleton concept for tests/compile/clustering.test.ts (extracted; 1 symbols).
resource: tests/compile/clustering.test.ts
tags:
  - tests
  - module
  - test
  - function
enrichment: accuracy-audited
from:
  - BACKFILL-r2mcp-12
explains:
  - tests/compile/clustering.test.ts#mem
stale: false
stale_reason: ""
graph_hash: c192643d124600fd68491305707bec2b09c19febe0921e729af00e7c9e27905f
---

# Structure

## Symbols
| Symbol | Kind | Span | Exported |
|---|---|---|---|
| `mem` | function | 10-12 | no |

# Explanation
This suite pins the deterministic grouping logic (src/compiler/clustering.ts) that both tier-compile and topic-compile depend on for stable section structure across repeated runs (spec B.R5/B.AC3). It exists because the LLM synthesis step downstream is inherently non-deterministic in its prose, so the only way to bound cross-run compiled-output churn to "prose variance only" is to guarantee the grouping and ordering fed into the LLM is itself perfectly order-independent and deterministic.

# Decisions
- (BACKFILL-r2mcp-12) `pickPrimaryTopic` sorts a memory's topic array and picks the lexicographically smallest — NOT the first-listed topic — specifically so grouping doesn't depend on incidental topic-array ordering from whatever process tagged the memory; tagging order isn't a meaningful signal, and using it as one would make output flip based on unrelated write-order details. The "two runs over the same input, reversed, produce the same cluster set" test is the crux of B.R5 — it's what makes B.AC3's later Levenshtein-ratio check meaningful at all: without deterministic clustering, header-set and cluster-membership differences between two runs would swamp any signal from genuine prose variance. Sorting memories within a cluster by raw string `id` (not `created_at`) is a deliberate tradeoff: ids are guaranteed unique and stable so this ordering can never tie or fluctuate, whereas `created_at` on bulk-inserted historical data frequently does tie.

# Citations
[1] BACKFILL-r2mcp-12 evidence: /Users/dustincheng/projects/claudeclaw/docs/specs/asbuilt-living-kb/evidence/backfill12-evidence.yml
