---
type: Test
title: tests/providers/claude-code.test.ts
description: Skeleton concept for tests/providers/claude-code.test.ts
  (extracted; 2 symbols).
resource: tests/providers/claude-code.test.ts
tags:
  - tests
  - module
  - test
  - function
enrichment: accuracy-audited
from:
  - BACKFILL-r2mcp-14
explains:
  - tests/providers/claude-code.test.ts#fakeSpawn
  - tests/providers/claude-code.test.ts#fakeSpawnEnoent
stale: false
stale_reason: ""
graph_hash: c192643d124600fd68491305707bec2b09c19febe0921e729af00e7c9e27905f
---

# Structure

## Symbols
| Symbol | Kind | Span | Exported |
|---|---|---|---|
| `fakeSpawn` | function | 9-22 | no |
| `fakeSpawnEnoent` | function | 113-126 | no |

# Explanation
This suite is the authoritative behavioral spec for the Claude Code headless provider adapter (src/providers/claude-code.ts) — the $0-cost, Max-plan-covered LLM provider that shells out to the local `claude` CLI instead of calling a hosted API. A future reader modifying the adapter's spawn handling, JSON envelope parsing, or error messages should treat every assertion here as a contract to preserve: cost_usd must stay exactly 0, concurrencyLimit must stay 2, and the ENOENT remediation message must keep naming R2MCP_CLAUDE_BIN.

# Decisions
- (BACKFILL-r2mcp-14) (1) cost_usd is asserted with strict `toBe(0)` rather than a tolerance check — deliberate, since the whole point of routing through Claude Code is that it is genuinely free under a Max plan, and any nonzero value would mean per-token pricing logic meant for the API-based providers had leaked in. (2) concurrencyLimit=2 is a conscious conservatism about subprocess overhead: each call forks a real `claude` CLI process, far heavier than an HTTP request, so the cap sits well below anthropic/openrouter's 10. (3) The ENOENT-specific rewrap (wrapSpawnError) exists because of a real incident (claw-8cjf.7): launchd jobs and MCP hosts often inherit a sanitized PATH that doesn't include the user's shell PATH, so `claude` silently isn't found even though it's installed — the fix fails with an actionable message naming R2MCP_CLAUDE_BIN rather than a bare Node ENOENT stack trace. Only ENOENT gets this treatment; other codes (e.g. EACCES) pass through unwrapped since a generic rewrap would obscure the real cause for a different failure mode. (4) fakeSpawn/fakeSpawnEnoent build a minimal EventEmitter-based mock of ChildProcess rather than using a real spawn, keeping the suite hermetic (no real subprocess in CI) while still exercising the real event-wiring code in runClaude.

# Citations
[1] BACKFILL-r2mcp-14 evidence: /Users/dustincheng/projects/claudeclaw/docs/specs/asbuilt-living-kb/evidence/backfill14-evidence.yml
