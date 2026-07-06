---
type: Test
title: tests/providers/semaphore.test.ts
description: Skeleton concept for tests/providers/semaphore.test.ts (extracted; 3 symbols).
resource: tests/providers/semaphore.test.ts
tags:
  - tests
  - module
  - test
  - const
enrichment: accuracy-audited
from:
  - BACKFILL-r2mcp-14
explains:
  - tests/providers/semaphore.test.ts#work
stale: false
stale_reason: ""
graph_hash: c192643d124600fd68491305707bec2b09c19febe0921e729af00e7c9e27905f
---

# Structure

## Symbols
| Symbol | Kind | Span | Exported |
|---|---|---|---|
| `work` | const | 15-21 | no |
| `work` | const | 31-36 | no |
| `work` | const | 45-50 | no |

# Explanation
This suite is the unit-level correctness spec for `Semaphore`, the primitive that both `runClassifier`'s driver loop and, indirectly, every provider's concurrency cap rely on. A future reader should treat Semaphore as small enough to reason about directly here — five focused tests, no mocking framework needed — rather than trusting only the higher-level concurrency-cap.test.ts integration tests.

# Decisions
- (BACKFILL-r2mcp-14) The FIFO-fairness assertion (`order` equals [1,2,3] under limit=1) is a specific design choice worth preserving — Semaphore uses a `waiters` array with `push`/`shift`, i.e. a strict queue, not a pool that could reorder or race waiting callers. A future reader replacing the internal waiter structure (e.g. for performance) needs to preserve this ordering guarantee or this test will correctly catch the regression. The "releases the permit even when the wrapped fn throws" test exists because `withPermit`'s `release()` call lives in a `finally` block — a deliberate defensive choice, since an un-released permit on an unlucky throw would permanently reduce a Semaphore's effective capacity by one, an insidious slow leak that would surface only as unexplained throughput degradation over the life of a long-running process, not as an immediate visible failure. The `peak`/`inFlight` getters are public API surface specifically so external tests (concurrency-cap.test.ts) can observe internal state without invasive spies — a future reader should not make these private again without providing an equivalent observability hook. Note also: the three `it` blocks each declare their own local `work` async closure (source lines 15-21, 31-36, 45-50) rather than sharing one helper — this is deliberate test isolation, not duplication, since each closure captures test-local `inFlight`/`peak` counters that must not leak across tests; only the last of the three is a distinct symbol in the graph manifest.

# Citations
[1] BACKFILL-r2mcp-14 evidence: /Users/dustincheng/projects/claudeclaw/docs/specs/asbuilt-living-kb/evidence/backfill14-evidence.yml
