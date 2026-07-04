---
type: Module
title: src/compiler/frontmatter.ts
description: Skeleton concept for src/compiler/frontmatter.ts (extracted; 8 symbols).
resource: src/compiler/frontmatter.ts
tags:
  - src
  - module
  - function
enrichment: none
from: []
explains: []
stale: false
stale_reason: ""
graph_hash: f3062700a89bb65b1df9622f69f7f24581224e0a7462079dc9cdb4a2395643c0
---

# Structure

## Exports
- `emitFrontmatter` (function, lines 14-33)
- `extractHeaders` (function, lines 102-109)
- `levenshteinRatio` (function, lines 140-145)
- `parseFrontmatter` (function, lines 40-85)
- `stripForBodyComparison` (function, lines 116-134)

## Symbols
| Symbol | Kind | Span | Exported |
|---|---|---|---|
| `emitFrontmatter` | function | 14-33 | yes |
| `extractHeaders` | function | 102-109 | yes |
| `levenshtein` | function | 147-163 | no |
| `levenshteinRatio` | function | 140-145 | yes |
| `parseFrontmatter` | function | 40-85 | yes |
| `quote` | function | 87-89 | no |
| `stripForBodyComparison` | function | 116-134 | yes |
| `unquote` | function | 91-96 | no |

## Calls out
- `emitFrontmatter` → `quote` (same file)
- `levenshteinRatio` → `levenshtein` (same file)
- `parseFrontmatter` → `unquote` (same file)

## Called by
- `runCompile` in [src/compiler/run.ts](/src/compiler/run.md)
