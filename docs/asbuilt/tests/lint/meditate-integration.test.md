---
type: Module
title: tests/lint/meditate-integration.test.ts
description: Skeleton concept for tests/lint/meditate-integration.test.ts
  (extracted; 1 symbols).
resource: tests/lint/meditate-integration.test.ts
tags:
  - tests
  - module
  - function
enrichment: accuracy-audited
from:
  - BACKFILL-r2mcp-13
explains:
  - tests/lint/meditate-integration.test.ts#mockPool
stale: false
stale_reason: ""
graph_hash: 722abd60fe9a14221204daed15ffc79c1ccb916aa2f11bc37b8d327971cb1d46
---

# Structure

## Symbols
| Symbol | Kind | Span | Exported |
|---|---|---|---|
| `mockPool` | function | 31-50 | no |

# Explanation
Documents the exact backward-compatibility contract meditate's opt-in lint integration must preserve: existing callers (the Slack bot, any programmatic caller) must see a byte-identical response shape unless they explicitly ask for `include_lint: true`. This file is the reference for "how do we add an opt-in field to an existing tool response without changing its default wire shape" — a pattern likely to recur as more tools grow optional response sections.

# Decisions
- (BACKFILL-r2mcp-13) The `.not.toHaveProperty('lint_findings')` assertion (rather than `expect(result.lint_findings).toBeUndefined()`) is a deliberate strictness choice — JS/JSON distinguishes "key present with value undefined" from "key absent," and only the latter guarantees a `JSON.stringify` of the response won't include a `"lint_findings": null`-shaped surprise for existing consumers. The mock pool's SQL-substring routing has to disambiguate meditate's own count/sum housekeeping queries from the five lint checks' SELECT patterns, which only matters at all because `include_lint: true` causes `meditate()` to internally call the full `runLint()` orchestrator rather than a stubbed lint result — this is a real integration test of the two subsystems' composition, not a shallow mock of `runLint` itself.

# Citations
[1] BACKFILL-r2mcp-13 evidence: /Users/dustincheng/projects/claudeclaw/docs/specs/asbuilt-living-kb/evidence/backfill13-evidence.yml
