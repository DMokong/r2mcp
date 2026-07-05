---
type: Module
title: tests/edges/candidate-pairs.test.ts
description: Skeleton concept for tests/edges/candidate-pairs.test.ts
  (extracted; 1 symbols).
resource: tests/edges/candidate-pairs.test.ts
tags:
  - tests
  - module
  - function
enrichment: accuracy-audited
from:
  - BACKFILL-r2mcp-12
explains:
  - tests/edges/candidate-pairs.test.ts#setPeople
stale: false
stale_reason: ""
graph_hash: 722abd60fe9a14221204daed15ffc79c1ccb916aa2f11bc37b8d327971cb1d46
---

# Structure

## Symbols
| Symbol | Kind | Span | Exported |
|---|---|---|---|
| `setPeople` | function | 12-14 | no |

# Explanation
This suite pins the SQL-level pre-filter (`findCandidatePairs` in src/edges/candidate-pairs.ts) that decides which memory pairs are even eligible for the expensive two-stage LLM classification pipeline (spec R5). It exists because classifying every possible pair of memories with Haiku then Opus would be O(n^2) in LLM calls; the pre-filter uses only cheap SQL set intersections (topics, people) to shrink the candidate set before any LLM cost is spent.

# Decisions
- (BACKFILL-r2mcp-12) The ">=2 topics OR >=1 person" threshold is a judgment call, not a provable constant: 1 shared topic was deemed too broad (unrelated memories often share one generic tag), while 2+ shared topics or any shared named person was judged a reasonable proxy for "these might be about the same thing." The `m1.id < m2.id` join condition is a purely structural trick that both deduplicates unordered pairs and excludes self-pairs in one predicate — it carries no business meaning, so a future reader shouldn't read significance into id ordering. `--since` inclusion requires only ONE of the two memories to be recent (OR, not AND): an old memory can gain a new candidate relation the moment a new memory sharing its topic/person appears, so gating on the newer side alone is sufficient for incremental runs. The pre-filter has zero notion of relation type — it only establishes "worth asking the LLM"; Stage 1 (Haiku) and Stage 2 (Opus) do all actual relation judgment.

# Citations
[1] BACKFILL-r2mcp-12 evidence: /Users/dustincheng/projects/claudeclaw/docs/specs/asbuilt-living-kb/evidence/backfill12-evidence.yml
