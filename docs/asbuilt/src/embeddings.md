---
type: Module
title: src/embeddings.ts
description: Skeleton concept for src/embeddings.ts (extracted; 3 symbols).
resource: src/embeddings.ts
tags:
  - src
  - module
  - function
enrichment: accuracy-audited
from:
  - BACKFILL-r2mcp-02
explains:
  - src/embeddings.ts#embedBatch
  - src/embeddings.ts#embedText
  - src/embeddings.ts#embeddingWarning
stale: false
stale_reason: ""
graph_hash: c192643d124600fd68491305707bec2b09c19febe0921e729af00e7c9e27905f
---

# Structure

## Exports
- `embedBatch` (function, lines 30-66)
- `embedText` (function, lines 68-74)
- `embeddingWarning` (function, lines 23-28)

## Symbols
| Symbol | Kind | Span | Exported |
|---|---|---|---|
| `embedBatch` | function | 30-66 | yes |
| `embedText` | function | 68-74 | yes |
| `embeddingWarning` | function | 23-28 | yes |

## Calls out
- `embedBatch` → [withEmbeddingSpan](/src/telemetry.md)
- `embedText` → `embedBatch` (same file)

## Called by
- `recall` in [src/tools/recall.ts](/src/tools/recall.md)
- `recall` in [src/tools/recall.ts](/src/tools/recall.md)
- `remember` in [src/tools/remember.ts](/src/tools/remember.md)
- `remember` in [src/tools/remember.ts](/src/tools/remember.md)

# Explanation
embeddings.ts is the only file in the codebase that talks to OpenRouter's embeddings endpoint. Its defining property is that every public function is null-safe end-to-end: a missing API key, an HTTP error, or a thrown exception in the fetch path all resolve to `null` rather than propagating an error, because losing embeddings must degrade recall to full-text search, not crash the memory-write path every other tool depends on.

# Decisions
- (BACKFILL-r2mcp-02) Returning `null` (never throwing) on both "no key" and "HTTP failure" is what forces every caller (remember.ts, recall.ts) to explicitly handle "no embedding" as a first-class outcome via `embeddingWarning()` instead of a try/catch around embedding calls — a deliberate constraint, not an oversight: a thrown error here would make every memory write fail whenever OpenRouter had a bad day. `embeddingWarning()` distinguishes "disabled" (no API key configured at all — a static condition an operator can fix once) from "failed" (key present but this specific call errored — a transient, worth-surfacing-per-call condition like rate limiting) by re-checking `process.env.R2MCP_OPENROUTER_API_KEY` at call time, rather than threading a reason code through `embedBatch`'s return value. The `data.data.sort((a,b) => a.index - b.index)` step exists because OpenRouter's batch response is not guaranteed to preserve request order; skipping it would silently mismatch `embedding[i]` to the wrong `text[i]` whenever a batch has more than one item — a corruption that "works" (embeddings are non-null) but attaches semantically wrong vectors to memories, nearly undetectable after the fact. `DEFAULT_MODEL` (`openai/text-embedding-3-small`) is baked in as a default parameter rather than surfaced via env var — changing embedding models later requires either passing `model` explicitly at every call site or re-embedding the whole corpus, since embeddings from different models are not comparable in the same vector space.

# Citations
[1] BACKFILL-r2mcp-02 evidence: /Users/dustincheng/projects/claudeclaw/docs/specs/asbuilt-living-kb/evidence/backfill02-evidence.yml
