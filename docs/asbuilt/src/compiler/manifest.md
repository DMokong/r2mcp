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
graph_hash: 54570211ff06c2bd59dd0a2dac52f1722134ad26c899e0f940f3d2a9c0d8f342
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
