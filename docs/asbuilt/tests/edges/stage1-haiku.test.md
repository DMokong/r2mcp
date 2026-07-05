---
type: Module
title: tests/edges/stage1-haiku.test.ts
description: Skeleton concept for tests/edges/stage1-haiku.test.ts (extracted; 1 symbols).
resource: tests/edges/stage1-haiku.test.ts
tags:
  - tests
  - module
  - function
enrichment: accuracy-audited
from:
  - BACKFILL-r2mcp-12
explains:
  - tests/edges/stage1-haiku.test.ts#makeMockProvider
stale: false
stale_reason: ""
graph_hash: 722abd60fe9a14221204daed15ffc79c1ccb916aa2f11bc37b8d327971cb1d46
---

# Structure

## Symbols
| Symbol | Kind | Span | Exported |
|---|---|---|---|
| `makeMockProvider` | function | 5-17 | no |

# Explanation
This suite pins the contract of the cheap, high-recall first pass of the two-stage classifier (the Haiku model): given a candidate pair, decide only whether it's worth sending to the expensive Opus stage. It exists to guarantee Stage 1's parsing is strict — a garbled or ambiguous model response must throw rather than silently default to pass or fail, because either silent default would corrupt the downstream cost/counter invariants asserted in classifier-internals.test.ts.

# Decisions
- (BACKFILL-r2mcp-12) `parseStage1Response`'s regex accepts an em-dash, hyphen, or colon as the verdict/comment separator, tuned empirically because Haiku doesn't reliably reproduce the exact em-dash shown in the system prompt's example format. Throwing on an unparseable reply ("maybe?") was chosen over a lenient default deliberately: a false "pass" wastes an Opus call, a false "fail" silently drops a real relation from the graph, so both silent defaults were rejected in favor of a hard failure that surfaces in the run's error surface rather than corrupting counts quietly. The mock asserts the literal request shape (model: 'haiku', max_tokens present, system prompt mentioning "relation") specifically so a future refactor that accidentally routes Stage 1 traffic through the Opus model, or drops max_tokens (risking runaway output cost), fails a test immediately rather than silently doubling per-call cost in production.

# Citations
[1] BACKFILL-r2mcp-12 evidence: /Users/dustincheng/projects/claudeclaw/docs/specs/asbuilt-living-kb/evidence/backfill12-evidence.yml
