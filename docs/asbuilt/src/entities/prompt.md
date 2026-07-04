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
enrichment: none
from: []
explains: []
stale: false
graph_hash: 54570211ff06c2bd59dd0a2dac52f1722134ad26c899e0f940f3d2a9c0d8f342
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
