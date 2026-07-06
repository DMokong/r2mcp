---
type: Test
title: tests/compile/run-compile.test.ts
description: Skeleton concept for tests/compile/run-compile.test.ts (extracted; 5 symbols).
resource: tests/compile/run-compile.test.ts
tags:
  - tests
  - module
  - test
  - function
  - interface
enrichment: accuracy-audited
from:
  - BACKFILL-r2mcp-12
explains:
  - tests/compile/run-compile.test.ts#RecordedFs
  - tests/compile/run-compile.test.ts#baseOpts
  - tests/compile/run-compile.test.ts#memory
  - tests/compile/run-compile.test.ts#mockFs
  - tests/compile/run-compile.test.ts#mockProvider
stale: false
stale_reason: ""
graph_hash: c192643d124600fd68491305707bec2b09c19febe0921e729af00e7c9e27905f
---

# Structure

## Symbols
| Symbol | Kind | Span | Exported |
|---|---|---|---|
| `RecordedFs` | interface | 19-24 | no |
| `baseOpts` | function | 71-80 | no |
| `memory` | function | 58-67 | no |
| `mockFs` | function | 26-43 | no |
| `mockProvider` | function | 45-56 | no |

# Explanation
This is the widest integration suite for the compile orchestrator (`runCompile` in src/compiler/run.ts), covering B.AC1, B.AC2, and B.AC4 through B.AC9 in one file. It runs fully in-process against a mocked CompileFs (in-memory Maps standing in for the filesystem) and a mocked LLMProvider returning deterministic canned prose, so every assertion is about orchestration behavior — mode validation, cost accounting, manifest/stale-file bookkeeping, frontmatter provenance — not about actual LLM output quality.

# Decisions
- (BACKFILL-r2mcp-12) The B.AC4 "keeps each Timeline entry on a single line" test guards a specific historical bug class: a naive `content.slice(0, 117)` excerpt on multi-line memory content would embed the memory's own newlines into a markdown bullet, visually splitting one Timeline row into several — the fixture deliberately constructs 120+ chars of content with embedded newlines to force that failure mode if it regresses. B.AC4's "prefers event_date over created_at" test encodes a real operational reality: backfilled/bulk-inserted memories share one created_at bulk-insert timestamp, so Timeline ordering and display must fall back to the memory's own event_date when present or the Timeline becomes a useless "everything happened at once" list — `effectiveDate()` in clustering.ts is the single implementation of this fallback, reused by both sort and display. B.AC8's stale-cleanup test intentionally demonstrates a non-obvious scoping rule: a topic-scoped compile run only ever deletes manifest entries within the CURRENT run's requested scope (tiers/topics actually touched) — an out-of-scope topic file is left alone even if it's now "stale" by data, because a partial compile invocation has no way to know whether the other topic's source memories still justify it; full cleanup of truly abandoned topics is deferred to an all/allTopics mode, noted in the test's own comments as "deferred to e2e." B.AC9's Max-only-provider test guards against a specific architecture violation: compile must go through the injected LLMProvider abstraction unconditionally, never falling through to a direct Anthropic SDK call that would require an API key even when the caller only has a Max subscription and passed the zero-cost claude-code provider.

# Citations
[1] BACKFILL-r2mcp-12 evidence: /Users/dustincheng/projects/claudeclaw/docs/specs/asbuilt-living-kb/evidence/backfill12-evidence.yml
