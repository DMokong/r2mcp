---
type: Module
title: src/compiler/run.ts
description: Skeleton concept for src/compiler/run.ts (extracted; 6 symbols).
resource: src/compiler/run.ts
tags:
  - src
  - module
  - function
  - interface
enrichment: none
from: []
explains: []
stale: false
graph_hash: 54570211ff06c2bd59dd0a2dac52f1722134ad26c899e0f940f3d2a9c0d8f342
---

# Structure

## Exports
- `CompileFs` (interface, lines 64-71)
- `RunCompileDeps` (interface, lines 48-62)
- `RunCompileOptions` (interface, lines 29-46)
- `runCompile` (function, lines 82-217)

## Symbols
| Symbol | Kind | Span | Exported |
|---|---|---|---|
| `CompileFs` | interface | 64-71 | yes |
| `RunCompileDeps` | interface | 48-62 | yes |
| `RunCompileOptions` | interface | 29-46 | yes |
| `mergeManifest` | function | 231-252 | no |
| `runCompile` | function | 82-217 | yes |
| `validateOptions` | function | 219-224 | no |

## Calls out
- `runCompile` → [compileTier](/src/compiler/tier.md)
- `runCompile` → [compileTopic](/src/compiler/topic.md)
- `runCompile` → [computeStaleFiles](/src/compiler/manifest.md)
- `runCompile` → [emitFrontmatter](/src/compiler/frontmatter.md)
- `runCompile` → [manifestPath](/src/compiler/manifest.md)
- `runCompile` → `mergeManifest` (same file)
- `runCompile` → [readManifest](/src/compiler/manifest.md)
- `runCompile` → [topicToSlug](/src/compiler/clustering.md)
- `runCompile` → `validateOptions` (same file)
- `runCompile` → [RunSummaryWriter.write](/src/edges/state.md)
- `runCompile` → [writeManifest](/src/compiler/manifest.md)

## Called by
- `main` in [src/cli/compile-wiki.ts](/src/cli/compile-wiki.md)
