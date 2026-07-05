---
type: Module
title: tests/entities/extractor.test.ts
description: Skeleton concept for tests/entities/extractor.test.ts (extracted; 2 symbols).
resource: tests/entities/extractor.test.ts
tags:
  - tests
  - module
  - function
enrichment: accuracy-audited
from:
  - BACKFILL-r2mcp-13
explains:
  - tests/entities/extractor.test.ts#mockProvider
  - tests/entities/extractor.test.ts#seedCorpus
stale: false
stale_reason: ""
graph_hash: 722abd60fe9a14221204daed15ffc79c1ccb916aa2f11bc37b8d327971cb1d46
---

# Structure

## Symbols
| Symbol | Kind | Span | Exported |
|---|---|---|---|
| `mockProvider` | function | 17-27 | no |
| `seedCorpus` | function | 49-59 | no |

# Explanation
The load-bearing regression suite for the entity-extraction driver — anyone changing `runExtractor`'s cost accounting, resume/state handling, hallucination detection, or concurrency model should treat every `it` block here as an independent invariant, not as "extractor tests" generically. Several tests exist specifically because of production bugs (claw-2jbo findings 1 and 2) rather than up-front design, which is a useful signal about which invariants are most fragile.

# Decisions
- (BACKFILL-r2mcp-13) The "R4 sentinel" test (peak in-flight == 1) is the single most important test in this file to understand before touching `runExtractor`'s main loop — it is not testing a feature, it is testing the absence of a feature (parallelism) that someone might reasonably add later for throughput, and the comment explicitly names the fix (add a `Semaphore`) that such a change would require alongside updating this test's expectation. The hallucination-handling tests (claw-2jbo findings 1+2) encode a specific security/correctness posture: an LLM claiming a match against a `canonical_name` that was never in the context it was given is assumed to be a hallucination and is silently dropped (counted, not written) rather than trusted — this means the extractor treats its own known-entity list as an allowlist, not merely a hint. The provider-throw test's structure (one call succeeds, then every subsequent call throws) is designed to prove partial progress survives a crash — a naive re-read of this test might assume it's testing "does the extractor retry," but its real point is "does the extractor NOT lose already-written state when a later memory in the same run fails."

# Citations
[1] BACKFILL-r2mcp-13 evidence: /Users/dustincheng/projects/claudeclaw/docs/specs/asbuilt-living-kb/evidence/backfill13-evidence.yml
