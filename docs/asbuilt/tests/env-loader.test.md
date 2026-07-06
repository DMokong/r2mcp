---
type: Test
title: tests/env-loader.test.ts
description: Skeleton concept for tests/env-loader.test.ts (extracted; 1 symbols).
resource: tests/env-loader.test.ts
tags:
  - tests
  - module
  - test
  - function
enrichment: accuracy-audited
from:
  - BACKFILL-r2mcp-11
explains:
  - tests/env-loader.test.ts#writeEnv
stale: false
stale_reason: ""
graph_hash: c192643d124600fd68491305707bec2b09c19febe0921e729af00e7c9e27905f
---

# Structure

## Symbols
| Symbol | Kind | Span | Exported |
|---|---|---|---|
| `writeEnv` | function | 29-33 | no |

# Explanation
Regression-anchored contract test for src/env.ts's loadEnvFile — the minimal hand-rolled .env parser used before any config module reads process.env. A future reader modifying loadEnvFile's parsing rules (quoting, comments, precedence) should extend this file rather than relying on ad hoc manual testing, since it is also the test that keeps .env.example itself honest (round-trip test 2 fails if .env.example stops being loader-parseable).

# Decisions
- (BACKFILL-r2mcp-11) The suite's name and first test case ("the R2MCP_* regression") exist because a naive parsing regex could plausibly reject variable names containing digits (R2MCP_OPENROUTER_API_KEY, R2MCP_DATABASE_URL) — this is pinned first and named explicitly so a future regex change that reintroduces that bug fails immediately and legibly rather than as a generic parse failure. The precedence rule (ambient process.env always wins over a value in the .env file) is asserted explicitly rather than assumed, because a change that flips it would silently make a developer's ambient exported env vars stop overriding a stale .env file's contents — a hard-to-diagnose local-dev bug. TOUCHED_KEYS is a fixed allowlist of every key any test in this file might mutate, snapshotted/restored around each test specifically so this file's process.env manipulation cannot leak into unrelated test files that happen to run in the same process.

# Citations
[1] BACKFILL-r2mcp-11 evidence: /Users/dustincheng/projects/claudeclaw/docs/specs/asbuilt-living-kb/evidence/backfill11-evidence.yml
