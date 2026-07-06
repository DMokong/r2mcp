---
type: Test
title: tests/lint/cli-output.test.ts
description: Skeleton concept for tests/lint/cli-output.test.ts (extracted; 2 symbols).
resource: tests/lint/cli-output.test.ts
tags:
  - tests
  - module
  - test
  - function
enrichment: accuracy-audited
from:
  - BACKFILL-r2mcp-13
explains:
  - tests/lint/cli-output.test.ts#makeResult
  - tests/lint/cli-output.test.ts#renderReport
stale: false
stale_reason: ""
graph_hash: c192643d124600fd68491305707bec2b09c19febe0921e729af00e7c9e27905f
---

# Structure

## Symbols
| Symbol | Kind | Span | Exported |
|---|---|---|---|
| `makeResult` | function | 13-17 | no |
| `renderReport` | function | 20-37 | no |

# Explanation
This file documents the *intended* structure of the lint CLI's human-readable report (one `##`-prefixed section per check with findings, always-present per-check summary counts) via a standalone reimplementation of the renderer, not the CLI's real code. A future reader should not mistake "this test passes" for "the CLI's actual terminal output is correct" — those are two different claims that happen to currently agree by construction, not by import.

# Decisions
- (BACKFILL-r2mcp-13) The decision to duplicate `renderReport` inline rather than import `src/cli/lint-memory.ts#renderReport` was made "to keep this test in-process" (per the file header) — importing the real CLI module would likely have been just as easy, since it's a pure function taking a `LintResult`, so this is worth revisiting: a future maintainer adding coverage here could swap the inline copy for a direct import of the real renderer with little cost, closing the drift risk noted in this concept's comprehension entry. Until that happens, any change to `src/cli/lint-memory.ts#renderReport`'s section-grouping or zero-count-display logic will NOT be caught by this test — only a change to this file's own inline copy would be.

# Citations
[1] BACKFILL-r2mcp-13 evidence: /Users/dustincheng/projects/claudeclaw/docs/specs/asbuilt-living-kb/evidence/backfill13-evidence.yml
