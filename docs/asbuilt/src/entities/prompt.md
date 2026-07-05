---
type: Module
title: src/entities/prompt.ts
description: Skeleton concept for src/entities/prompt.ts (extracted; 6 symbols).
resource: src/entities/prompt.ts
tags:
  - src
  - module
  - function
  - interface
  - type
enrichment: accuracy-audited
from:
  - BACKFILL-r2mcp-07
explains:
  - src/entities/prompt.ts#ParseResult
  - src/entities/prompt.ts#PromptInput
  - src/entities/prompt.ts#buildExtractionPrompt
  - src/entities/prompt.ts#clamp01
  - src/entities/prompt.ts#isMatched
  - src/entities/prompt.ts#parseExtractionResponse
stale: false
stale_reason: ""
graph_hash: 722abd60fe9a14221204daed15ffc79c1ccb916aa2f11bc37b8d327971cb1d46
---

# Structure

## Exports
- `ParseResult` (type, lines 9-11)
- `PromptInput` (interface, lines 90-93)
- `buildExtractionPrompt` (function, lines 95-129)
- `parseExtractionResponse` (function, lines 27-88)

## Symbols
| Symbol | Kind | Span | Exported |
|---|---|---|---|
| `ParseResult` | type | 9-11 | yes |
| `PromptInput` | interface | 90-93 | yes |
| `buildExtractionPrompt` | function | 95-129 | yes |
| `clamp01` | function | 23-25 | no |
| `isMatched` | function | 13-21 | no |
| `parseExtractionResponse` | function | 27-88 | yes |

## Calls out
- `parseExtractionResponse` → `clamp01` (same file)
- `parseExtractionResponse` → `isMatched` (same file)

## Called by
- `runExtractor` in [src/entities/extractor.ts](/src/entities/extractor.md)
- `runExtractor` in [src/entities/extractor.ts](/src/entities/extractor.md)

# Explanation
prompt.ts is the request/response contract boundary between this codebase and the LLM used for entity extraction: buildExtractionPrompt renders the outbound request text, parseExtractionResponse validates and shapes the inbound JSON. A future reader should treat these two functions as a matched pair even though nothing in the type system enforces that pairing.

# Decisions
- (BACKFILL-r2mcp-07) The prompt text and the parser's expected JSON shape are coupled only by the fact that they live in the same file and were written by the same hand — there is no shared schema (e.g. zod) generating both the prompt's example JSON and the parser's validation logic, so an edit to one (e.g. renaming a field, changing the allowed entity-type list) will not raise a compile error in the other; a future editor changing the prompt's JSON shape must manually update parseExtractionResponse (and vice versa) or the two will silently diverge. The prompt instructs the model that matched canonical_names 'must EXACTLY match... (case-sensitive)', but the ACTUAL resolution logic downstream (extractor.ts, via normalizeEntityName) is case-INSENSITIVE and also NFKC/whitespace-normalizing — this is a deliberate belt-and-suspenders design, not a bug: the strict prompt wording is meant to discipline the model into precise output, while the real matching logic is intentionally more forgiving of minor formatting drift the model might still produce despite the instruction. parseExtractionResponse's error handling has two tiers with different severities: STRUCTURAL problems (invalid JSON, missing/non-array `matched` or `new_entities`) fail the WHOLE response (`{ok:false}`, extractor.ts counts this as parse_failures and retries on resume); but a problem with one INDIVIDUAL entry inside an otherwise-valid response (bad type, empty canonical_name, out-of-range confidence) is repaired or dropped in place with a `warnings` string, letting the rest of the batch still succeed. That `warnings` array is currently a dead end, though — ParseResult.warnings is populated and returned but runExtractor never reads it, so today these per-entry problems (a clamped confidence, a dropped malformed entry) leave no trace in the run summary, logs, or any observable signal; a future maintainer investigating 'why did entity X never get created despite being in the memory' should know to re-run this parser manually against the raw response rather than expect the existing warnings machinery to have surfaced it.

# Citations
[1] BACKFILL-r2mcp-07 evidence: /Users/dustincheng/projects/claudeclaw/docs/specs/asbuilt-living-kb/evidence/backfill07-evidence.yml
