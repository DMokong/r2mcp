---
type: Module
title: src/tools/recall.ts
description: Skeleton concept for src/tools/recall.ts (extracted; 26 symbols).
resource: src/tools/recall.ts
tags:
  - src
  - module
  - function
  - interface
  - type
enrichment: accuracy-audited
from:
  - BACKFILL-r2mcp-01
explains:
  - src/tools/recall.ts#FullRecallResult
  - src/tools/recall.ts#RecallInput
  - src/tools/recall.ts#RecallResult
  - src/tools/recall.ts#applyMMR
  - src/tools/recall.ts#compactResponse
  - src/tools/recall.ts#compactResult
  - src/tools/recall.ts#entityOnlySearch
  - src/tools/recall.ts#fulltextSearchTier
  - src/tools/recall.ts#hybridSearchTier
  - src/tools/recall.ts#progressiveHybridSearch
  - src/tools/recall.ts#recall
  - src/tools/recall.ts#scopeClause
stale: false
stale_reason: ""
graph_hash: c192643d124600fd68491305707bec2b09c19febe0921e729af00e7c9e27905f
---

# Structure

## Exports
- `EntityLink` (interface, lines 43-47)
- `FullRecallResponse` (interface, lines 93-104)
- `FullRecallResult` (interface, lines 54-69)
- `MatchType` (type, lines 25-25)
- `RecallInput` (interface, lines 151-172)
- `RecallResponse` (interface, lines 111-126)
- `RecallResult` (interface, lines 76-90)
- `SearchMode` (type, lines 26-26)
- `Tier` (type, lines 24-24)
- `applyMMR` (function, lines 239-273)
- `compactResponse` (function, lines 142-149)
- `compactResult` (function, lines 129-139)
- `cosineSimilarity` (function, lines 182-193)
- `estimateTokens` (function, lines 206-209)
- `jaccardSimilarity` (function, lines 195-204)
- `recall` (function, lines 513-696)

## Symbols
| Symbol | Kind | Span | Exported |
|---|---|---|---|
| `EntityLink` | interface | 43-47 | yes |
| `FullRecallResponse` | interface | 93-104 | yes |
| `FullRecallResult` | interface | 54-69 | yes |
| `InternalResult` | interface | 175-178 | no |
| `MatchType` | type | 25-25 | yes |
| `RecallInput` | interface | 151-172 | yes |
| `RecallResponse` | interface | 111-126 | yes |
| `RecallResult` | interface | 76-90 | yes |
| `SearchMode` | type | 26-26 | yes |
| `Tier` | type | 24-24 | yes |
| `applyMMR` | function | 239-273 | yes |
| `applyTierWeight` | function | 233-235 | no |
| `compactResponse` | function | 142-149 | yes |
| `compactResult` | function | 129-139 | yes |
| `cosineSimilarity` | function | 182-193 | yes |
| `docSimilarity` | function | 220-225 | no |
| `entityOnlySearch` | function | 471-509 | no |
| `estimateTokens` | function | 206-209 | yes |
| `fulltextSearchTier` | function | 361-415 | no |
| `hybridSearchTier` | function | 277-359 | no |
| `jaccardSimilarity` | function | 195-204 | yes |
| `parseEmbedding` | function | 211-218 | no |
| `progressiveHybridSearch` | function | 419-463 | no |
| `recall` | function | 513-696 | yes |
| `scopeClause` | function | 18-22 | no |
| `stripInternal` | function | 227-231 | no |

## Calls out
- `applyMMR` → `docSimilarity` (same file)
- `docSimilarity` → `cosineSimilarity` (same file)
- `docSimilarity` → `jaccardSimilarity` (same file)
- `entityOnlySearch` → `scopeClause` (same file)
- `fulltextSearchTier` → `applyTierWeight` (same file)
- `fulltextSearchTier` → `scopeClause` (same file)
- `hybridSearchTier` → `applyTierWeight` (same file)
- `hybridSearchTier` → `parseEmbedding` (same file)
- `hybridSearchTier` → `scopeClause` (same file)
- `progressiveHybridSearch` → `hybridSearchTier` (same file)
- `recall` → `applyMMR` (same file)
- `recall` → `compactResponse` (same file)
- `recall` → [currentScope](/src/env.md)
- `recall` → [embedText](/src/embeddings.md)
- `recall` → [embeddingWarning](/src/embeddings.md)
- `recall` → `entityOnlySearch` (same file)
- `recall` → `estimateTokens` (same file)
- `recall` → [findEntityByInput](/src/entities/db.md)
- `recall` → `fulltextSearchTier` (same file)
- `recall` → [getEntityLinksForMemories](/src/entities/db.md)
- `recall` → [getPool](/src/db.md)
- `recall` → [getSignalsForMemoryIds](/src/edges/signals.md)
- `recall` → `hybridSearchTier` (same file)
- `recall` → `progressiveHybridSearch` (same file)
- `recall` → `scopeClause` (same file)

## Called by
- `avgPairwiseSim` in [tests/tools/recall-v2.test.ts](/tests/tools/recall-v2.test.md)

# Explanation
This module is the read half of r2mcp's memory architecture — the "recall" in the remember/recall pair. Memories live in three tiers (`preferences`, `project-context`, `conversations`) and this file is where a free-text query (optionally combined with an `entity` filter, per SPEC-046) gets turned into a ranked, budgeted set of results. It's the module that decides semantic vs. fulltext mode, whether to search tiers progressively or all at once, how to deduplicate near-identical results, and what shape goes out over the wire. Every other tool in r2mcp that needs to look something up (lint, compile, lookalike diagnostics) ultimately calls into `recall()` here or reuses its helper functions. It's invoked from the `recall` MCP tool registration in `src/index.ts`, wrapped by `src/mcp-response.ts#asMcpResponse` (which layers on the `next_tools[]` breadcrumb array from `src/breadcrumbs.ts` before the response is serialized).

# Decisions
- (BACKFILL-r2mcp-01) Tier ranking is weighted, not flat: `TIER_WEIGHTS` gives `preferences` 1.3x, `project-context` 1.0x, `conversations` 0.8x — so a mediocre preferences-tier match can outrank a strong conversations-tier match, reflecting that preferences are meant to be higher-authority than session chatter. Progressive search (`progressiveHybridSearch`, default on) walks tiers top-down and stops as soon as any result's raw score reaches `DEFAULT_CONFIDENCE_THRESHOLD = 0.82` — a performance/cost tradeoff, since each additional tier is another DB round trip. Hybrid ranking blends signals with a fixed 0.7/0.3 split (`0.7 * semantic_score + 0.3 * fulltext_score`) baked directly into the SQL `CASE` expression, not exposed as a tunable. MMR diversity (`applyMMR`) defaults to `DEFAULT_DIVERSITY = 0.7` (lambda), i.e. mostly-relevance-ranked with just enough diversity pressure to drop near-duplicates; it falls back from cosine similarity on raw embeddings to Jaccard word-overlap (`docSimilarity` → `jaccardSimilarity`) whenever an embedding is missing, so diversity re-ranking still functions in fulltext-only (degraded) mode. Both `DEFAULT_MIN_SCORE_HYBRID` and `DEFAULT_MIN_SCORE_FULLTEXT` default to `0.0` (no floor) specifically to preserve backward compatibility with v1 callers — the code comment is explicit that callers must opt in to a floor (e.g. 0.3 semantic / 0.1 fulltext) rather than one being silently imposed. `candidateLimit = max(top_k * 3, 30)` over-fetches so MMR has enough candidates to actually diversify against. The internal/wire type split (`FullRecallResult`/`FullRecallResponse` vs. `RecallResult`/`RecallResponse`, squeezed through `compactResult` / `compactResponse`) exists purely to cut response token cost (claw-ohhj.3): the wire shape rounds scores to 3 decimals, keeps only one timestamp (`updated`), drops the `query` echo and empty `persons`, and only includes `early_stopped`/`signals` keys when they're true/non-empty — every omitted key is a deliberate token-cost optimization, not an oversight. Scope handling has two independent knobs layered together: `all_scopes: true` bypasses filtering entirely (scopes = null), while an explicit `scope` param (claw-sdcn, P0a) lets one running server read a *different* project's corpus (still unioned with `global`) — e.g. so a global-scoped server process can compile a per-project wiki. The `hasDbEmbeddings` probe query deliberately re-applies the exact same scope filter as the main search (`scopeClause`) so the "does this corpus have embeddings" check can never diverge from the rows actually being searched — a subtle correctness fix (claw-nyxd) for what would otherwise be a scope leak in the semantic/fulltext mode decision. The SPEC-046 entity-only fast path (`entityOnlySearch`) is a deliberate short-circuit: when `entity` is set but `query` is empty, `embedText` is never called at all (the code comment notes this avoids "burn[ing] an embedding round-trip for nothing"), and every returned row gets a hardcoded `score: 1.0` since there's no relevance signal to rank by — results are ordered by `updated_at DESC` instead. An unresolved `entity` is explicitly *not* an error: `recall()` returns an empty result set with `entity_resolved: false` rather than throwing. Finally, `top_k` is always the hard cap even under a `max_tokens` budget — the comment "top_k is always an upper bound" flags this as intentional, so a caller can't accidentally get more results than `top_k` just by raising `max_tokens`.

# Citations
[1] BACKFILL-r2mcp-01 evidence: /Users/dustincheng/projects/claudeclaw/.claude/worktrees/asbuilt-living-kb/docs/specs/asbuilt-living-kb/evidence/backfill-evidence.yml
