---
type: Test
title: tests/edges/classifier-internals.test.ts
description: Skeleton concept for tests/edges/classifier-internals.test.ts
  (extracted; 1 symbols).
resource: tests/edges/classifier-internals.test.ts
tags:
  - tests
  - module
  - test
  - function
enrichment: accuracy-audited
from:
  - BACKFILL-r2mcp-12
explains:
  - tests/edges/classifier-internals.test.ts#makeDeps
stale: false
stale_reason: ""
graph_hash: c192643d124600fd68491305707bec2b09c19febe0921e729af00e7c9e27905f
---

# Structure

## Symbols
| Symbol | Kind | Span | Exported |
|---|---|---|---|
| `makeDeps` | function | 13-30 | no |

# Explanation
This suite exercises `runClassifier`'s orchestration logic in isolation from any real DB, LLM, or filesystem — every collaborator is injected via `ClassifierDeps` and mocked. It exists to pin the cost-cap arithmetic, resume semantics, and counter bookkeeping that are otherwise nearly impossible to assert deterministically against a live LLM, whose per-call cost and pass/fail outcome are structurally non-deterministic.

# Decisions
- (BACKFILL-r2mcp-12) The cost cap is checked BEFORE each stage's call using conservative fixed pre-call cost estimates (STAGE1_EST_COST_USD=0.0005, STAGE2_EST_COST_USD=0.04 in src/edges/classifier.ts), not after — a run can stop one call short of the cap rather than overshoot it, and the test comments spell out the exact running-total arithmetic pair by pair so a future reader can verify the cap logic without re-deriving it. Resume treats a pair as done only if its `pair_hash` appears with a TERMINAL stage (opus_complete, haiku_skip, cap_reached, rejection_skip) for the SAME run_id in the JSONL state file — this is why the AC10 test explicitly re-derives `pairHash('a','b')` and checks `terminalPairs` picks it up: a downgraded (contradicts to none) result still writes an `opus_complete` record with no edge, so resume won't re-spend an Opus call re-litigating a pair the LLM already refused to relate. Dry-run is a hard early-return before `markActiveRun` — no `.last-run` file, no state writes — making a `--dry-run` invocation provably a filesystem no-op, asserted directly via `existsSync` on the last-run path rather than inferred from behavior alone.

# Citations
[1] BACKFILL-r2mcp-12 evidence: /Users/dustincheng/projects/claudeclaw/docs/specs/asbuilt-living-kb/evidence/backfill12-evidence.yml
