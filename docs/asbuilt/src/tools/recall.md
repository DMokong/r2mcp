---
type: Module
title: src/tools/recall.ts
description: Skeleton concept for src/tools/recall.ts (extracted; 26 symbols).
resource: src/tools/recall.ts
enrichment: none
from: []
explains: []
stale: false
graph_hash: 77d367245d49ace6ef0672a008ab019becccb6dbdf36b1e5dba5e4679096f6d2
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
