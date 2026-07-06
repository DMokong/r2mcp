---
type: Test
title: tests/entities/extract-entities-tool.test.ts
description: Skeleton concept for tests/entities/extract-entities-tool.test.ts
  (extracted; 2 symbols).
resource: tests/entities/extract-entities-tool.test.ts
tags:
  - tests
  - module
  - test
  - function
enrichment: accuracy-audited
from:
  - BACKFILL-r2mcp-13
explains:
  - tests/entities/extract-entities-tool.test.ts#fakeSpawn
  - tests/entities/extract-entities-tool.test.ts#mockRunSummary
stale: false
stale_reason: ""
graph_hash: c192643d124600fd68491305707bec2b09c19febe0921e729af00e7c9e27905f
---

# Structure

## Symbols
| Symbol | Kind | Span | Exported |
|---|---|---|---|
| `fakeSpawn` | function | 20-33 | no |
| `mockRunSummary` | function | 35-50 | no |

# Explanation
Documents the boundary contract between the MCP-facing `extract_entities` tool and the subprocess it delegates to. This file is the canonical reference for "how does an MCP tool in this codebase spawn and supervise a child process" — the pattern here (injectable `spawnFn`, `EventEmitter`-based fakes, settled-flag guarded promise resolution, injectable timeout) is explicitly said to mirror `tests/tools/classify.test.ts`, so a future subprocess- delegating tool test should follow this file's shape rather than reinventing one.

# Decisions
- (BACKFILL-r2mcp-13) The suite avoids `vi.mock('node:child_process')` on purpose, favoring dependency injection instead — module-level mocks persist mock state across tests in the same file and can require `vi.resetModules()` gymnastics, whereas passing `spawnFn` through `deps` keeps each test's mock scoped to itself. The OTel-trace-propagation tests (claw-2jbo finding 6) exist because there is no real OTel SDK registered in the test environment — `context.with()` is a no-op under the `NoopContextManager`, so there is no way to make a span genuinely "active" the normal way; the workaround is mocking `trace.getActiveSpan()` directly to return a fake span with known trace and span IDs. The explicit save/restore of `process.env.OTEL_TRACEPARENT` around the no-active-span test exists because a leaked env var from a prior test run or from the ambient test-runner environment could otherwise produce a false pass — this is defensive isolation, not incidental cleanup.

# Citations
[1] BACKFILL-r2mcp-13 evidence: /Users/dustincheng/projects/claudeclaw/docs/specs/asbuilt-living-kb/evidence/backfill13-evidence.yml
