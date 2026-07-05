---
type: Module
title: tests/lint/checks.test.ts
description: Skeleton concept for tests/lint/checks.test.ts (extracted; 1 symbols).
resource: tests/lint/checks.test.ts
tags:
  - tests
  - module
  - function
enrichment: accuracy-audited
from:
  - BACKFILL-r2mcp-13
explains:
  - tests/lint/checks.test.ts#mockPool
stale: false
stale_reason: ""
graph_hash: 722abd60fe9a14221204daed15ffc79c1ccb916aa2f11bc37b8d327971cb1d46
---

# Structure

## Symbols
| Symbol | Kind | Span | Exported |
|---|---|---|---|
| `mockPool` | function | 17-21 | no |

# Explanation
Documents the confidence-and-action policy encoded across the five lint checks — this is the single place to look to understand "what confidence number does check X produce under condition Y," since each check's SQL lives in its own file but the tests here assert the derived business logic in one place. A future reader wanting to understand the semantic difference between `drift` and `superseded_unflagged` (both look like "two memories should probably be linked/relinked") should read this file's `describe` blocks side by side.

# Decisions
- (BACKFILL-r2mcp-13) The confidence thresholds asserted here (0.95/0.7 for stale, 0.6 for orphans, <0.9 for drift, 0.85/0.92 for superseded_unflagged) are not arbitrary test fixtures — they are the actual production thresholds `src/lint/run.ts#applyFixes` gates `--fix` on (>= 0.9 auto-fixes). A future change to any of these numbers in the check implementation must be mirrored here or this suite will fail — but the inverse is the real risk: if someone changes a threshold in the check file AND updates this test's expected value to match, without also asking "does this change which findings now qualify for auto-fix," the test suite will pass while quietly changing what `lint --fix` does in production. The `memoryId` SQL-parameter-order test exists because that ordering is a positional array construction that TypeScript cannot type-check for correctness — a future reader adding a new filter parameter to `findContradictions` should re-verify this test's expected params array by hand, not assume the compiler would have caught a misordering.

# Citations
[1] BACKFILL-r2mcp-13 evidence: /Users/dustincheng/projects/claudeclaw/docs/specs/asbuilt-living-kb/evidence/backfill13-evidence.yml
