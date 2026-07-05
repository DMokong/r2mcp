---
type: Module
title: src/edges/stage1-haiku.ts
description: Skeleton concept for src/edges/stage1-haiku.ts (extracted; 4 symbols).
resource: src/edges/stage1-haiku.ts
tags:
  - src
  - module
  - function
  - interface
enrichment: accuracy-audited
from:
  - BACKFILL-r2mcp-06
explains:
  - src/edges/stage1-haiku.ts#PairForFilter
  - src/edges/stage1-haiku.ts#Stage1Result
  - src/edges/stage1-haiku.ts#parseStage1Response
  - src/edges/stage1-haiku.ts#stage1HaikuFilter
stale: false
stale_reason: ""
graph_hash: 722abd60fe9a14221204daed15ffc79c1ccb916aa2f11bc37b8d327971cb1d46
---

# Structure

## Exports
- `PairForFilter` (interface, lines 4-7)
- `Stage1Result` (interface, lines 9-13)
- `parseStage1Response` (function, lines 25-35)
- `stage1HaikuFilter` (function, lines 37-57)

## Symbols
| Symbol | Kind | Span | Exported |
|---|---|---|---|
| `PairForFilter` | interface | 4-7 | yes |
| `Stage1Result` | interface | 9-13 | yes |
| `parseStage1Response` | function | 25-35 | yes |
| `stage1HaikuFilter` | function | 37-57 | yes |

## Calls out
- `stage1HaikuFilter` → `parseStage1Response` (same file)
- `stage1HaikuFilter` → [withLLMCallSpan](/src/telemetry.md)

## Called by
- `main` in [src/cli/classify-edges.ts](/src/cli/classify-edges.md)

# Explanation
Stage 1 exists purely as a cost gate in front of the much more expensive Stage 2 call — it does not itself produce any persisted classification, only a pass/fail signal consumed by `classifier.ts#processPair`. A future reader tuning classification cost should look here first: this is the highest-leverage lever for total spend, since it runs on every candidate pair while Stage 2 only runs on the subset that passes.

# Decisions
- (BACKFILL-r2mcp-06) The filter is deliberately loose/recall-favoring (per its own system prompt: say YES if the pairs even plausibly overlap) rather than precise — this is an intentional cost/accuracy trade-off, not an oversight: false positives here just cost one extra (and comparatively cheap) Stage 2 call, whereas false negatives silently and permanently drop a pair from ever being classified, with no retry path and no record of what was excluded. If classification quality complaints ever trace back to "this pair should have an edge but doesn't," Stage 1 rejecting it is a more likely root cause than Stage 2 misclassifying it. `parseStage1Response` throws on any unparseable reply rather than defaulting to pass or fail — this was a deliberate choice to surface model drift/prompt regressions loudly (as a crash in `processPair`) instead of silently corrupting the run with a guessed outcome; don't "fix" a parse failure by making it default to `pass: false` without considering that this hides the actual problem (the model no longer follows the expected output format). The `withLLMCallSpan` wrapper (claw-1ejd) exists solely so that OTEL trace context propagates correctly when this file's caller (`classify-edges.ts`) runs as a subprocess — it has nothing to do with the classification logic and can be ignored when reasoning about correctness.

# Citations
[1] BACKFILL-r2mcp-06 evidence: /Users/dustincheng/projects/claudeclaw/docs/specs/asbuilt-living-kb/evidence/backfill06-evidence.yml
