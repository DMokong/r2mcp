---
type: Module
title: tests/tools/classify.test.ts
description: Skeleton concept for tests/tools/classify.test.ts (extracted; 2 symbols).
resource: tests/tools/classify.test.ts
tags:
  - tests
  - module
  - function
enrichment: accuracy-audited
from:
  - BACKFILL-r2mcp-11
explains:
  - tests/tools/classify.test.ts#fakeSpawn
  - tests/tools/classify.test.ts#mockClassifySummary
stale: false
stale_reason: ""
graph_hash: 722abd60fe9a14221204daed15ffc79c1ccb916aa2f11bc37b8d327971cb1d46
---

# Structure

## Symbols
| Symbol | Kind | Span | Exported |
|---|---|---|---|
| `fakeSpawn` | function | 10-23 | no |
| `mockClassifySummary` | function | 25-40 | no |

# Explanation
Verifies the classify() MCP tool's entire contract is "compose the right CLI flags, spawn cli/classify-edges, parse its JSON summary, propagate failures/timeouts faithfully" — the tool does no classification logic itself. A future reader adding a new classify() input parameter should add a corresponding flag-composition assertion here rather than testing the parameter against the real classifier pipeline, since this file's entire reason to exist is decoupling "does the MCP handler wire parameters correctly" from "does the classifier produce correct edges" (the latter is tested elsewhere, against the real subprocess).

# Decisions
- (BACKFILL-r2mcp-11) This suite is a near-mirror of tests/tools/compile-handler.test.ts by design (same fakeSpawn EventEmitter-stub pattern, same spawnFn-injection seam) — the two tools share an architectural pattern (thin MCP handler that delegates all real work, including any LLM calls, to a subprocess CLI) and are tested with the same technique for the same reason: an MCP server that makes its own LLM calls violates a constraint from SPEC-044, and mocking spawn is the only way to test the handler's argument-composition and parsing logic without either making a real LLM call or coupling this test's pass/fail to the classifier pipeline's correctness. The timeout test's fake spawn deliberately never emits an 'exit' event — this is the one case in the suite that isn't testing output parsing at all, but proving classify() enforces its own runTimeoutMs ceiling rather than trusting the OS or the subprocess to terminate; a future reader who removes or weakens that timeout enforcement in classify.ts should expect this specific test to catch it via a hang, not a clean failure.

# Citations
[1] BACKFILL-r2mcp-11 evidence: /Users/dustincheng/projects/claudeclaw/docs/specs/asbuilt-living-kb/evidence/backfill11-evidence.yml
