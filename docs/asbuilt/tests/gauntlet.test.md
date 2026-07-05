---
type: Module
title: tests/gauntlet.test.ts
description: Skeleton concept for tests/gauntlet.test.ts (extracted; 4 symbols).
resource: tests/gauntlet.test.ts
tags:
  - tests
  - module
  - function
enrichment: accuracy-audited
from:
  - BACKFILL-r2mcp-11
explains:
  - tests/gauntlet.test.ts#avgPairwiseSim
  - tests/gauntlet.test.ts#clearMemories
  - tests/gauntlet.test.ts#insertBackdated
  - tests/gauntlet.test.ts#percentile
stale: false
stale_reason: ""
graph_hash: 722abd60fe9a14221204daed15ffc79c1ccb916aa2f11bc37b8d327971cb1d46
---

# Structure

## Symbols
| Symbol | Kind | Span | Exported |
|---|---|---|---|
| `avgPairwiseSim` | function | 894-908 | no |
| `clearMemories` | function | 64-66 | no |
| `insertBackdated` | function | 69-88 | no |
| `percentile` | function | 59-62 | no |

## Calls out
- `insertBackdated` → [remember](/src/tools/remember.md)

# Explanation
The Gauntlet is the closest thing this repo has to a smoke test for "did I break the memory system" — every core tool exercised together against a real Postgres instance, organized as 11 numbered, independently readable scenarios. A future reader debugging a cross-tool regression (e.g. "recall stopped respecting reject" or "meditate archived something it shouldn't have") should look here first, since scenarios are written to be individually diagnostic (each names the exact tool interaction it pins in its describe-block title).

# Decisions
- (BACKFILL-r2mcp-11) The outer beforeEach unconditionally deletes R2MCP_OPENROUTER_API_KEY so every scenario except the explicitly-gated Scenario 6 runs in deterministic fulltext-only mode — this trades semantic-path coverage for determinism/speed in the common case. The consequence: only Scenario 6 is wrapped in it.skipIf(!originalApiKey) and will silently not run at all in any environment lacking a real OpenRouter key, including CI unless a key is deliberately provisioned there — a future reader should not read a green Gauntlet run as proof that semantic recall works unless they've confirmed the key was present and that skipIf-gated test actually executed (skipped tests report as passing, not as "not run" in a typical vitest summary glance). Scenario 11 is NOT part of this gate — it carries no skipIf and always runs, but it also independently deletes the API key inline before doing anything else, so even in an environment with a real key configured, Scenario 11 never exercises Recall v2's semantic path; a future reader wanting evidence of semantic-mode token reduction or early-stop behavior needs tests/tools/recall-v2.test.ts's separately-gated tests, not this scenario. The benchmark block's 5-second-per-tool ceiling is intentionally generous — a sanity floor against catastrophic regressions (e.g. an accidental full-table-scan), not a performance SLA; a reader tightening it to catch real perf regressions should add a separate, tighter assertion rather than lowering this one, since CI machine variance makes a tight bound here flaky. Scenario 9's insertBackdated helper backdates by directly UPDATE-ing created_at after going through the normal remember() path — this exists because there is no supported way to insert a memory with an arbitrary creation timestamp through the tool API itself, and the staleness threshold meditate() uses (90 days) is exercised at ~100 days to give margin against off-by-one boundary flakiness.

# Citations
[1] BACKFILL-r2mcp-11 evidence: /Users/dustincheng/projects/claudeclaw/docs/specs/asbuilt-living-kb/evidence/backfill11-evidence.yml
