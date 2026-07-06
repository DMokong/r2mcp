---
type: Module
title: src/entities/extractor.ts
description: Skeleton concept for src/entities/extractor.ts (extracted; 3 symbols).
resource: src/entities/extractor.ts
tags:
  - src
  - module
  - function
  - interface
enrichment: accuracy-audited
from:
  - BACKFILL-r2mcp-07
explains:
  - src/entities/extractor.ts#RunExtractorOptions
  - src/entities/extractor.ts#finalize
  - src/entities/extractor.ts#runExtractor
stale: false
stale_reason: ""
graph_hash: c192643d124600fd68491305707bec2b09c19febe0921e729af00e7c9e27905f
---

# Structure

## Exports
- `RunExtractorOptions` (interface, lines 25-36)
- `runExtractor` (function, lines 38-186)

## Symbols
| Symbol | Kind | Span | Exported |
|---|---|---|---|
| `RunExtractorOptions` | interface | 25-36 | yes |
| `finalize` | function | 188-217 | no |
| `runExtractor` | function | 38-186 | yes |

## Calls out
- `runExtractor` → [buildExtractionPrompt](/src/entities/prompt.md)
- `runExtractor` → [currentScope](/src/env.md)
- `runExtractor` → `finalize` (same file)
- `runExtractor` → [findCandidateMemories](/src/entities/db.md)
- `runExtractor` → [getTopEntitiesByFrequency](/src/entities/db.md)
- `runExtractor` → [linkMemoryToEntity](/src/entities/db.md)
- `runExtractor` → [normalizeEntityName](/src/entities/normalize.md)
- `runExtractor` → [parseExtractionResponse](/src/entities/prompt.md)
- `runExtractor` → [upsertEntity](/src/entities/db.md)
- `runExtractor` → [withLLMCallSpan](/src/telemetry.md)

## Called by
- `main` in [src/cli/extract-entities.ts](/src/cli/extract-entities.md)

# Explanation
runExtractor is the orchestration core of SPEC-046's entity extraction feature: given a batch of candidate memories, it turns each one into zero or more entity records and memory-entity links by round-tripping through an LLM, while enforcing a hard per-run dollar cost cap and supporting exact resume after a crash or manual stop. A future reader should think of it as a for-loop over memories with four possible per-memory outcomes (skip-terminal, skip-cap-reached, extracted, parse-failed) plus one whole-run-ending outcome (provider error) — everything else in the file (finalize, RunExtractorOptions) exists to serve that loop.

# Decisions
- (BACKFILL-r2mcp-07) The known-entities lookup map (knownById) is built exactly ONCE, from a snapshot fetched before the loop starts (getTopEntitiesByFrequency), not refreshed as new_entities are upserted mid-run — a deliberate perf tradeoff (claw-2jbo finding 1) to avoid an N+1 DB round-trip per matched entity, since the spec requires the LLM to echo a canonical_name verbatim from the context it was given, so the map 'should always hit' for well-behaved output. The tradeoff a future maintainer must know: if entity A is created as a new_entity for memory #3, and memory #47 later in the SAME run has the LLM 'match' entity A by that same canonical_name, the match will MISS (knownById doesn't have it) and get counted as hallucinated_matched + silently dropped, even though entity A now genuinely exists in the DB — a false-positive hallucination signal caused entirely by within-run staleness, not an actual LLM mistake. The cost cap is checked in two places for two different reasons: once at the top of the loop (opts.maxCostUsd already exceeded -> skip this memory as cap_reached, no LLM call) and once again immediately after the LLM call returns (in case THIS call's cost pushed the total over) purely to set hit_cost_cap=true for the summary — there is no pre-flight cost estimate, so total_cost_usd can overshoot maxCostUsd by up to the cost of exactly one more LLM call; the cap is a soft ceiling checked between calls, not a hard per-call budget. A provider exception (network failure, rate limit, etc.) does not throw out of runExtractor — it triggers an early `return finalize(...)` with an `error` string, meaning the function's return type (RunSummary) is used for BOTH the happy path and the 'the whole run failed partway through' path; callers (the extract-entities CLI, and the extract_entities MCP tool that spawns it as a subprocess) must inspect `summary.error` rather than relying on a catch block to detect provider failure — only failures that occur BEFORE runExtractor is even called (e.g. ProviderUnavailableError from selectProvider, or a DB connectivity failure) surface as actual thrown exceptions at the CLI level. `parse_failed` memories are the only non-terminal outcome — a resumed run retries them — on the theory that a parse failure is more likely a transient LLM formatting slip than a memory that is fundamentally unparseable; if the same memory fails to parse across many resumed runs, nothing in this file currently detects or caps that (there's no retry-count field), so a systematically bad memory could be retried forever across resumes.

# Citations
[1] BACKFILL-r2mcp-07 evidence: /Users/dustincheng/projects/claudeclaw/docs/specs/asbuilt-living-kb/evidence/backfill07-evidence.yml
