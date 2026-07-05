---
type: Module
title: tests/tools/recall-v2.test.ts
description: Skeleton concept for tests/tools/recall-v2.test.ts (extracted; 2 symbols).
resource: tests/tools/recall-v2.test.ts
tags:
  - tests
  - module
  - function
enrichment: accuracy-audited
from:
  - BACKFILL-r2mcp-11
explains:
  - tests/tools/recall-v2.test.ts#avgPairwiseSim
  - tests/tools/recall-v2.test.ts#makeInternalResult
stale: false
stale_reason: ""
graph_hash: 722abd60fe9a14221204daed15ffc79c1ccb916aa2f11bc37b8d327971cb1d46
---

# Structure

## Symbols
| Symbol | Kind | Span | Exported |
|---|---|---|---|
| `avgPairwiseSim` | function | 527-536 | no |
| `makeInternalResult` | function | 737-754 | no |

## Calls out
- `avgPairwiseSim` → [jaccardSimilarity](/src/tools/recall.md)

# Explanation
This is the evaluation suite for Recall v2's redesign — relevance floor, MMR diversity, token budgeting, and progressive tier search — and it is the one place the project's specific numeric success criteria (40-50% token reduction, no cosine-sim>0.9 duplicates, >60% early-stop rate, <50ms P95 overhead) are written down as executable assertions rather than just spec prose. A future reader validating any change to src/tools/recall.ts's ranking, dedup, or budgeting logic should run this file specifically, and should be skeptical of a green run unless they've confirmed which tests actually executed (see decisions).

# Decisions
- (BACKFILL-r2mcp-11) A meaningful fraction of this suite's real evidentiary value is gated behind it.skipIf(!apiKey) — the token-reduction and early-stop tests that most directly validate Recall v2's headline promises only run with a real OpenRouter key present, matching the same skipIf-gating pattern as tests/gauntlet.test.ts's Scenario 6. A future reader treating a green CI run as proof that Recall v2's semantic-mode claims hold should first confirm the key was actually provisioned in that run; a fulltext-only green run only proves the MMR/budgeting mechanics work, not that they deliver the claimed token reduction in the mode where token reduction actually matters most. Two response-shape invariants are asserted repeatedly and easy to overlook on a skim: early_stopped must be OMITTED entirely (undefined), never explicitly false, unless it is true (claw-ohhj.3) — a future reader "cleaning up" the response type to always include the field with an explicit boolean would break every one of these assertions; and the top-level `query` echo field was deliberately removed from the response shape, asserted via not.toHaveProperty. The avgPairwiseSim() Jaccard-based diversity proxy used here (and independently redefined in tests/gauntlet.test.ts, itself never gated and always run in forced-fulltext mode) is explicitly NOT the same metric as the cosineSimilarity() used inside the real MMR implementation — Jaccard is a cheap, dependency-free proxy for diversity measurement in tests, while cosine similarity over embeddings is what actually drives MMR's diversity penalty in production; a future reader should not assume these two suites are validating MMR's actual similarity metric, only a correlated proxy for it.

# Citations
[1] BACKFILL-r2mcp-11 evidence: /Users/dustincheng/projects/claudeclaw/docs/specs/asbuilt-living-kb/evidence/backfill11-evidence.yml
