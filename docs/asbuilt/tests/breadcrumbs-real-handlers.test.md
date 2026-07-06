---
type: Test
title: tests/breadcrumbs-real-handlers.test.ts
description: Skeleton concept for tests/breadcrumbs-real-handlers.test.ts
  (extracted; 1 symbols).
resource: tests/breadcrumbs-real-handlers.test.ts
tags:
  - tests
  - module
  - test
  - function
enrichment: accuracy-audited
from:
  - BACKFILL-r2mcp-11
explains:
  - tests/breadcrumbs-real-handlers.test.ts#seedTwoContradictingMemories
stale: false
stale_reason: ""
graph_hash: c192643d124600fd68491305707bec2b09c19febe0921e729af00e7c9e27905f
---

# Structure

## Symbols
| Symbol | Kind | Span | Exported |
|---|---|---|---|
| `seedTwoContradictingMemories` | function | 37-57 | no |

# Explanation
This suite exists because a class of bug already shipped once (claw-sup7): a breadcrumb mapper that turns a tool's raw response into a "next_tools" suggestion list was tested against hand-written fixtures that didn't match what the real handler actually returned, so three shape mismatches went undetected. A future reader modifying either a tool handler's response shape OR a breadcrumb mapper must treat this suite, not the older fixture-based breadcrumb suites, as the source of truth — it is the one that will actually catch drift between the two.

# Decisions
- (BACKFILL-r2mcp-11) The design principle here is "test against the real handler, not a fixture that models the real handler" — every test in this file calls recall()/lint()/remember() directly against a live test DB rather than constructing a fake response object shaped like what the mapper expects. This is more expensive (real DB round-trips) but is the entire point: a fixture-based test could not have caught claw-sup7 because the bug WAS the fixture's shape being wrong. The lint→compile breadcrumb test explicitly checks findings[0].topic is read directly off the finding object (the claw-sup7 fix) rather than requiring a lookup back to the memory row — a future reader should not "simplify" lint's finding shape by dropping that field without also updating the compile breadcrumb mapper, since that field IS the fix this suite pins. The remember→recall test explicitly checks the handler exposes `id` (not `memory_id`) — called out in a comment as something "the mapper must read" — flagging that this exact field-name mismatch is a plausible way to reintroduce a shape-drift bug.

# Citations
[1] BACKFILL-r2mcp-11 evidence: /Users/dustincheng/projects/claudeclaw/docs/specs/asbuilt-living-kb/evidence/backfill11-evidence.yml
