---
type: Module
title: src/compiler/manifest.ts
description: Skeleton concept for src/compiler/manifest.ts (extracted; 5 symbols).
resource: src/compiler/manifest.ts
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
- `computeStaleFiles` (function, lines 56-82)
- `deleteStaleFiles` (function, lines 84-91)
- `manifestPath` (function, lines 16-18)
- `readManifest` (function, lines 20-29)
- `writeManifest` (function, lines 31-39)

## Symbols
| Symbol | Kind | Span | Exported |
|---|---|---|---|
| `computeStaleFiles` | function | 56-82 | yes |
| `deleteStaleFiles` | function | 84-91 | yes |
| `manifestPath` | function | 16-18 | yes |
| `readManifest` | function | 20-29 | yes |
| `writeManifest` | function | 31-39 | yes |

## Calls out
- `readManifest` → `manifestPath` (same file)
- `writeManifest` → `manifestPath` (same file)

## Called by
- `runCompile` in [src/compiler/run.ts](/src/compiler/run.md)
- `runCompile` in [src/compiler/run.ts](/src/compiler/run.md)
- `runCompile` in [src/compiler/run.ts](/src/compiler/run.md)
- `runCompile` in [src/compiler/run.ts](/src/compiler/run.md)
