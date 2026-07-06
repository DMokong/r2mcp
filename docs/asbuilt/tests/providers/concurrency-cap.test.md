---
type: Test
title: tests/providers/concurrency-cap.test.ts
description: Skeleton concept for tests/providers/concurrency-cap.test.ts
  (extracted; 2 symbols).
resource: tests/providers/concurrency-cap.test.ts
tags:
  - tests
  - module
  - test
  - function
enrichment: accuracy-audited
from:
  - BACKFILL-r2mcp-14
explains:
  - tests/providers/concurrency-cap.test.ts#makeDeps
  - tests/providers/concurrency-cap.test.ts#mkStub
stale: false
stale_reason: ""
graph_hash: c192643d124600fd68491305707bec2b09c19febe0921e729af00e7c9e27905f
---

# Structure

## Symbols
| Symbol | Kind | Span | Exported |
|---|---|---|---|
| `makeDeps` | function | 29-66 | no |
| `mkStub` | function | 21-27 | no |

# Explanation
This suite validates the interaction between the classifier driver (`runClassifier` in src/edges/classifier.ts) and the `Semaphore` primitive at integration level — that the driver actually threads a provider's `concurrencyLimit` through to bound real in-flight work, not merely that Semaphore itself works (that narrower claim belongs to semaphore.test.ts). A future reader adding a new provider or reworking the driver's dispatch loop should re-run this suite to confirm the new provider's cap is honored end-to-end, not just unit-tested in isolation.

# Decisions
- (BACKFILL-r2mcp-14) Instrumenting `stage1Filter` (rather than instrumenting the Semaphore directly) is deliberate — it proves the cap is enforced from the caller's observable perspective, at the exact boundary the driver was built to protect (external LLM calls), rather than re-testing the internal semaphore mechanism a second time. The three concurrency values tested (2, 10, and an implicit default of 1) are not arbitrary — they map directly onto the shipped providers' real concurrencyLimit values (claude-code=2, anthropic/openrouter=10) plus the SPEC-043 backward-compatible sequential default when no limit is passed, so this suite is effectively pinning production configuration values, not just the enforcement mechanism. Because those values are hardcoded here rather than imported from the provider classes, a future reader changing a provider's concurrencyLimit should manually check whether these expectations need to move in lockstep — this suite will not fail automatically if the two drift apart.

# Citations
[1] BACKFILL-r2mcp-14 evidence: /Users/dustincheng/projects/claudeclaw/docs/specs/asbuilt-living-kb/evidence/backfill14-evidence.yml
