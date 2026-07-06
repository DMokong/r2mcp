---
type: Test
title: tests/entities/e2e-cost.test.ts
description: Skeleton concept for tests/entities/e2e-cost.test.ts (extracted; 1 symbols).
resource: tests/entities/e2e-cost.test.ts
tags:
  - tests
  - module
  - test
  - function
enrichment: accuracy-audited
from:
  - BACKFILL-r2mcp-13
explains:
  - tests/entities/e2e-cost.test.ts#makeHaikuLikeProvider
stale: false
stale_reason: ""
graph_hash: c192643d124600fd68491305707bec2b09c19febe0921e729af00e7c9e27905f
---

# Structure

## Symbols
| Symbol | Kind | Span | Exported |
|---|---|---|---|
| `makeHaikuLikeProvider` | function | 25-45 | no |

# Explanation
This is the single test in the codebase that pins a dollar-figure acceptance criterion (SPEC-046 AC7) as a hard, deterministic number rather than a fuzzy "seems reasonable" check. A future reader changing the extractor's cost-accounting logic, the per-memory candidate loop, or the provider interface's `cost_usd` field should re-run this file specifically — it is the only place a $/call regression across 100 memories gets caught mechanically.

# Decisions
- (BACKFILL-r2mcp-13) The mock provider's five-value cost cycle (mean $0.0040) was chosen deliberately over a single fixed cost or a randomized cost — the in-file comment attributes this to a gate-2b advisory that wanted the mock to look "realistic" (varying like a real Haiku bill would) while remaining exactly reproducible (`toBeCloseTo(0.4, 4)` would be impossible to assert confidently against a randomized generator without loosening the tolerance and weakening the test). If a future engineer needs a stricter or looser budget check, the natural place to change is `PER_CALL_COSTS`, not the assertion tolerance. `maxCostUsd: 1.0` is set well above the expected $0.40 total specifically so this test never exercises the cost-cap early-exit path — that path is intentionally left to `extractor.test.ts`'s dedicated cost-cap test, keeping this file focused on one thing (the steady-state budget number) rather than conflating it with cap behavior.

# Citations
[1] BACKFILL-r2mcp-13 evidence: /Users/dustincheng/projects/claudeclaw/docs/specs/asbuilt-living-kb/evidence/backfill13-evidence.yml
