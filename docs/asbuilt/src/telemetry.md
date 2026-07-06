---
type: Module
title: src/telemetry.ts
description: Skeleton concept for src/telemetry.ts (extracted; 3 symbols).
resource: src/telemetry.ts
tags:
  - src
  - module
  - function
enrichment: accuracy-audited
from:
  - BACKFILL-r2mcp-10
explains:
  - src/telemetry.ts#withEmbeddingSpan
  - src/telemetry.ts#withLLMCallSpan
  - src/telemetry.ts#withToolSpan
stale: false
stale_reason: ""
graph_hash: c192643d124600fd68491305707bec2b09c19febe0921e729af00e7c9e27905f
---

# Structure

## Exports
- `withEmbeddingSpan` (function, lines 116-148)
- `withLLMCallSpan` (function, lines 84-111)
- `withToolSpan` (function, lines 45-69)

## Symbols
| Symbol | Kind | Span | Exported |
|---|---|---|---|
| `withEmbeddingSpan` | function | 116-148 | yes |
| `withLLMCallSpan` | function | 84-111 | yes |
| `withToolSpan` | function | 45-69 | yes |

## Called by
- `main` in [src/cli/classify-edges.ts](/src/cli/classify-edges.md)
- `main` in [src/cli/compile-wiki.ts](/src/cli/compile-wiki.md)
- `compileTier` in [src/compiler/tier.ts](/src/compiler/tier.md)
- `compileTopic` in [src/compiler/topic.ts](/src/compiler/topic.md)
- `stage1HaikuFilter` in [src/edges/stage1-haiku.ts](/src/edges/stage1-haiku.md)
- `stage2OpusClassify` in [src/edges/stage2-opus.ts](/src/edges/stage2-opus.md)
- `embedBatch` in [src/embeddings.ts](/src/embeddings.md)
- `runExtractor` in [src/entities/extractor.ts](/src/entities/extractor.md)

# Explanation
Thin OTel wrapper layer providing three specific span/metric shapes (tool invocation, LLM call, embedding call) used consistently across the MCP tool layer, the wiki compiler, and the entity/edge classification pipeline. It degrades to no-ops automatically when the SDK isn't started (`OTEL_ENABLED` unset — see `instrumentation.ts`), so none of these wrappers need their own enabled/disabled branching logic.

# Decisions
- (BACKFILL-r2mcp-10) `withLLMCallSpan` exists specifically to give cross-process trace propagation something to attach to: CLI scripts restore a parent trace context from an `OTEL_TRACEPARENT` env var (set by the MCP-server parent process before spawning a subprocess for LLM classification work), but a restored parent context is inert until some code in the child actually opens a span — this wrapper is that span (claw-1ejd). Removing it would silently break distributed tracing across the MCP-server-to-CLI-subprocess boundary with no functional symptom, which is exactly the kind of regression that's easy to miss without deliberately checking trace continuity. Cost estimation in `withEmbeddingSpan` uses a hardcoded per-token rate (`EMBEDDING_COST_PER_TOKEN`) for OpenRouter's text-embedding-3-small pricing plus a 4-chars-per-token heuristic — this is a rough telemetry-only estimate for cost dashboards, not a billing-accurate figure, and will silently be wrong for other embedding models if the provider is ever swapped without updating this constant. All three wrappers use a `finally` block to record duration and end the span even on error, and set `SpanStatusCode.ERROR` before re-throwing — errors are annotated, never swallowed, so callers still see and handle the original exception. `withToolSpan` increments `toolCount` before calling `fn` but `toolErrors` only on catch, so `tool_count` and `tool_errors` are two independent counters rather than one status-labeled counter — a dashboard computing an error rate needs to divide `tool_errors` by `tool_count`, not read a single combined metric.

# Citations
[1] BACKFILL-r2mcp-10 evidence: /Users/dustincheng/projects/claudeclaw/docs/specs/asbuilt-living-kb/evidence/backfill10-evidence.yml
