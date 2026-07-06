---
type: Module
title: src/entities/db.ts
description: Skeleton concept for src/entities/db.ts (extracted; 12 symbols).
resource: src/entities/db.ts
tags:
  - src
  - module
  - function
  - interface
  - type
enrichment: accuracy-audited
from:
  - BACKFILL-r2mcp-02
explains:
  - src/entities/db.ts#findCandidateMemories
  - src/entities/db.ts#findEntityByInput
  - src/entities/db.ts#getEntityLinksForMemories
  - src/entities/db.ts#getTopEntitiesByFrequency
  - src/entities/db.ts#linkMemoryToEntity
  - src/entities/db.ts#mergeAliases
  - src/entities/db.ts#upsertEntity
stale: false
stale_reason: ""
graph_hash: c192643d124600fd68491305707bec2b09c19febe0921e729af00e7c9e27905f
---

# Structure

## Exports
- `CandidateFilter` (interface, lines 149-159)
- `LinkResult` (interface, lines 98-100)
- `UpsertEntityInput` (interface, lines 15-19)
- `UpsertEntityResult` (interface, lines 20-23)
- `findCandidateMemories` (function, lines 160-188)
- `findEntityByInput` (function, lines 54-79)
- `getEntityLinksForMemories` (function, lines 190-219)
- `getTopEntitiesByFrequency` (function, lines 117-147)
- `linkMemoryToEntity` (function, lines 101-115)
- `mergeAliases` (function, lines 81-96)
- `upsertEntity` (function, lines 25-52)

## Symbols
| Symbol | Kind | Span | Exported |
|---|---|---|---|
| `CandidateFilter` | interface | 149-159 | yes |
| `DbClient` | type | 13-13 | no |
| `LinkResult` | interface | 98-100 | yes |
| `UpsertEntityInput` | interface | 15-19 | yes |
| `UpsertEntityResult` | interface | 20-23 | yes |
| `findCandidateMemories` | function | 160-188 | yes |
| `findEntityByInput` | function | 54-79 | yes |
| `getEntityLinksForMemories` | function | 190-219 | yes |
| `getTopEntitiesByFrequency` | function | 117-147 | yes |
| `linkMemoryToEntity` | function | 101-115 | yes |
| `mergeAliases` | function | 81-96 | yes |
| `upsertEntity` | function | 25-52 | yes |

## Calls out
- `findCandidateMemories` → [currentScope](/src/env.md)
- `findEntityByInput` → [currentScope](/src/env.md)
- `findEntityByInput` → [normalizeEntityName](/src/entities/normalize.md)
- `getTopEntitiesByFrequency` → [currentScope](/src/env.md)
- `mergeAliases` → [normalizeEntityName](/src/entities/normalize.md)
- `upsertEntity` → [currentScope](/src/env.md)
- `upsertEntity` → [normalizeEntityName](/src/entities/normalize.md)

## Called by
- `runExtractor` in [src/entities/extractor.ts](/src/entities/extractor.md)
- `runExtractor` in [src/entities/extractor.ts](/src/entities/extractor.md)
- `runExtractor` in [src/entities/extractor.ts](/src/entities/extractor.md)
- `runExtractor` in [src/entities/extractor.ts](/src/entities/extractor.md)
- `recall` in [src/tools/recall.ts](/src/tools/recall.md)
- `recall` in [src/tools/recall.ts](/src/tools/recall.md)
- `seed3MemoriesWithSpeculator` in [tests/entities/recall-entity-filter.test.ts](/tests/entities/recall-entity-filter.test.md)
- `seed3MemoriesWithSpeculator` in [tests/entities/recall-entity-filter.test.ts](/tests/entities/recall-entity-filter.test.md)

# Explanation
entities/db.ts is the pure data-access layer underneath the entity-extraction feature (turning free-text memories into structured project/person/tool/decision entities that recall can filter by). It contains no LLM calls and no business logic about WHEN to extract — that lives in entities/extractor.ts; this file is "given ids and normalized strings, read or write rows," nothing more.

# Decisions
- (BACKFILL-r2mcp-02) `upsertEntity()`'s ON CONFLICT clause unions aliases with `ARRAY(SELECT DISTINCT UNNEST(entities.aliases || EXCLUDED.aliases))` rather than overwriting — an earlier version silently dropped `EXCLUDED.aliases` on conflict (claw-2jbo, PR #1 finding 3), meaning every alias passed to a second-and-later upsert of an existing entity was thrown away unless the caller separately remembered to call `mergeAliases()`. The fix folds the merge into `upsertEntity()` itself so callers get it for free; `mergeAliases()` stays exported for callers that already have just an entity id and no full upsert payload. Entity identity (the ON CONFLICT target and `findEntityByInput`'s WHERE clause) is scoped by `project_scope`, mirroring the same per-scope isolation decision made in remember.ts's fingerprint dedup (claw-nyxd) — so resolving "the entity named X" in project A cannot silently match a same-named entity project B created. `findEntityByInput()` defaults to `[currentScope(), DEFAULT_SCOPE]` (current project plus the shared global bucket), and treats `scopes: null` as an explicit opt-in to cross-project (all_scopes) resolution. `getTopEntitiesByFrequency()` returns `normalized_name` in addition to `id`/`canonical_name` specifically so the extraction driver can build an in-memory lookup and resolve every LLM-echoed canonical name locally, avoiding an N+1 `findEntityByInput()` round-trip per entity mention the LLM extracted — a pattern that would otherwise scale with corpus size rather than with distinct entities. `getEntityLinksForMemories()` explicitly casts `confidence::float` in SQL because `memory_entities.confidence` is `NUMERIC(3,2)` (chosen to match `memory_edges`' confidence column from SPEC-043) and node-postgres returns NUMERIC columns as JS strings by default — every caller types this field as `number`, so the cast has to happen at the query, not scattered across call sites.

# Citations
[1] BACKFILL-r2mcp-02 evidence: /Users/dustincheng/projects/claudeclaw/docs/specs/asbuilt-living-kb/evidence/backfill02-evidence.yml
