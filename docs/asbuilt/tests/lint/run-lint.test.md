---
type: Test
title: tests/lint/run-lint.test.ts
description: Skeleton concept for tests/lint/run-lint.test.ts (extracted; 1 symbols).
resource: tests/lint/run-lint.test.ts
tags:
  - tests
  - module
  - test
  - function
enrichment: accuracy-audited
from:
  - BACKFILL-r2mcp-13
explains:
  - tests/lint/run-lint.test.ts#poolWithScripts
stale: false
stale_reason: ""
graph_hash: c192643d124600fd68491305707bec2b09c19febe0921e729af00e7c9e27905f
---

# Structure

## Symbols
| Symbol | Kind | Span | Exported |
|---|---|---|---|
| `poolWithScripts` | function | 13-38 | no |

# Explanation
The reference suite for `runLint`'s orchestration contract: stable response shape regardless of which `check` filter is used, confidence-gated (not check-gated) auto-fix behavior, and the explicit non-goal that lint makes zero LLM calls (C.R5). A future reader adding a sixth lint check should extend `poolWithScripts`'s SQL-substring routing carefully and re-read the ordering-sensitivity comment before assuming a new `if (sql.includes(...))` branch is safe to append anywhere in the chain.

# Decisions
- (BACKFILL-r2mcp-13) The `calls` array on the mock pool being intentionally exposed (not encapsulated) is what lets the `--fix` tests assert on the *actual* SQL statements issued, not just on `fixes_applied`'s claims — this was a deliberate test-design choice to catch a bug class where the returned summary says a fix was applied but the underlying UPDATE never ran (or ran with the wrong WHERE clause). The ordering rule documented inline — UPDATE branches checked first, then orphans before stale — exists because SQL substring matching is inherently fragile against overlapping fragments; a future engineer touching any check's SQL text should treat a green `run-lint.test.ts` with suspicion if they also changed a check's SQL shape, since a broken match would silently return `{rows: []}` (looking like "no findings") rather than erroring. The final C.R5 test is deliberately a no-op-looking assertion (`typeof runLint === 'function'`) — this is an honest acknowledgment that "makes no LLM calls" is a structural/architectural constraint that unit tests cannot mechanically enforce; its value is as a marker comment plus a trivial assertion that would need to be touched (and therefore noticed) if `runLint`'s signature ever grew a provider parameter.

# Citations
[1] BACKFILL-r2mcp-13 evidence: /Users/dustincheng/projects/claudeclaw/docs/specs/asbuilt-living-kb/evidence/backfill13-evidence.yml
