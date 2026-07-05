---
type: Module
title: tests/providers/cross-provider-agreement.test.ts
description: Skeleton concept for
  tests/providers/cross-provider-agreement.test.ts (extracted; 5 symbols).
resource: tests/providers/cross-provider-agreement.test.ts
tags:
  - tests
  - module
  - function
  - interface
  - type
enrichment: accuracy-audited
from:
  - BACKFILL-r2mcp-14
explains:
  - tests/providers/cross-provider-agreement.test.ts#CorpusEntry
  - tests/providers/cross-provider-agreement.test.ts#Result
  - tests/providers/cross-provider-agreement.test.ts#availableProviders
  - tests/providers/cross-provider-agreement.test.ts#loadCorpus
  - tests/providers/cross-provider-agreement.test.ts#shouldRun
stale: false
stale_reason: ""
graph_hash: 722abd60fe9a14221204daed15ffc79c1ccb916aa2f11bc37b8d327971cb1d46
---

# Structure

## Symbols
| Symbol | Kind | Span | Exported |
|---|---|---|---|
| `CorpusEntry` | interface | 28-32 | no |
| `Result` | type | 81-81 | no |
| `availableProviders` | function | 47-60 | no |
| `loadCorpus` | function | 34-41 | no |
| `shouldRun` | function | 43-45 | no |

# Explanation
This is the only real-LLM (non-mocked) test in the providers suite — a pre-merge sanity gate, not a per-commit CI guardrail, verifying that the Stage 2 edge classifier produces materially the same classifications regardless of which LLM provider executes it. A future reader should understand that this test being skipped in ordinary `npm test` runs is expected and correct, not test-suite rot: it is gated behind `R2MCP_RUN_CROSS_PROVIDER=1` because it costs real money (~$0.50-$1 per run across two paid providers) and real time (600s timeout).

# Decisions
- (BACKFILL-r2mcp-14) The corpus-shape assertion ("at least 30 pairs spanning all 6 relation types") runs unconditionally, even when the expensive comparison test is skipped — intentional, since it's a cheap always-on guard against the fixture file (tests/fixtures/edge-corpus.jsonl) silently losing entries or relation-type coverage during unrelated edits, independent of whether anyone has the env var or API keys set. claude-code is excluded from `availableProviders()` by default, behind a second, separate env var (`R2MCP_CROSS_PROVIDER_INCLUDE_CLAUDE_CODE=1`), because unlike the other two providers it can't be detected via an API-key env var — it depends on interactive OAuth login state, a much heavier precondition to assume in an automated context. The agreement thresholds (≥90% relation agreement, ≤10% of pairs with confidence drift >0.1) were chosen as "good enough" bars for a subjective LLM classification task — a future reader shouldn't read a near-threshold pass/fail as evidence of a code bug without first checking whether a prompt or model version changed.

# Citations
[1] BACKFILL-r2mcp-14 evidence: /Users/dustincheng/projects/claudeclaw/docs/specs/asbuilt-living-kb/evidence/backfill14-evidence.yml
