---
type: Module
title: tests/tools/compile-handler.test.ts
description: Skeleton concept for tests/tools/compile-handler.test.ts
  (extracted; 2 symbols).
resource: tests/tools/compile-handler.test.ts
tags:
  - tests
  - module
  - function
enrichment: accuracy-audited
from:
  - BACKFILL-r2mcp-11
explains:
  - tests/tools/compile-handler.test.ts#fakeSpawn
  - tests/tools/compile-handler.test.ts#mockSummary
stale: false
stale_reason: ""
graph_hash: 722abd60fe9a14221204daed15ffc79c1ccb916aa2f11bc37b8d327971cb1d46
---

# Structure

## Symbols
| Symbol | Kind | Span | Exported |
|---|---|---|---|
| `fakeSpawn` | function | 15-28 | no |
| `mockSummary` | function | 30-38 | no |

# Explanation
Verifies the compile() MCP tool's contract, most importantly the SPEC-044 constraint-of-record that the MCP server process makes zero LLM calls itself — everything happens in the spawned compile-wiki subprocess. A future reader should treat this file as the enforcement mechanism for that constraint, not just a functionality test: if a future change makes compile() call an LLM API directly for "efficiency," this suite's mock-spawn structure would need to change to still catch it, which is itself a signal that the constraint was being violated.

# Decisions
- (BACKFILL-r2mcp-11) The mode-selection validation ("exactly one of tier/all/topic") is tested for both the zero-modes and multiple-modes failure cases explicitly, rather than just the success case — mode selection here determines which distinct compile-wiki invocation shape gets built, so an ambiguous input silently picking one mode over another would produce a confusing wrong-scope compile run rather than a clear error. The trailing-JSON-parser test (parsing the summary out of stdout that contains an earlier JSON-shaped blob from dry-run preview output) is the most load-bearing test in the file: it exists because compile-wiki's dry-run mode legitimately prints JSON-ish preview content before its real summary, so a naive "parse the first JSON object in stdout" implementation would silently return the wrong (noise) object instead of throwing — a future reader changing the parser's strategy (e.g. to streaming JSON parsing) must preserve "last balanced top-level object wins," which this test pins explicitly by constructing stdout with noise BEFORE the real summary.

# Citations
[1] BACKFILL-r2mcp-11 evidence: /Users/dustincheng/projects/claudeclaw/docs/specs/asbuilt-living-kb/evidence/backfill11-evidence.yml
