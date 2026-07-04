---
type: Module
title: src/providers/index.ts
description: Skeleton concept for src/providers/index.ts (extracted; 5 symbols).
resource: src/providers/index.ts
tags:
  - src
  - module
  - function
  - interface
enrichment: none
from: []
explains: []
stale: false
stale_reason: ""
graph_hash: f3062700a89bb65b1df9622f69f7f24581224e0a7462079dc9cdb4a2395643c0
---

# Structure

## Exports
- `SelectProviderOptions` (interface, lines 36-47)
- `isProviderName` (function, lines 32-34)
- `selectProvider` (function, lines 49-75)

## Symbols
| Symbol | Kind | Span | Exported |
|---|---|---|---|
| `SelectProviderOptions` | interface | 36-47 | yes |
| `instantiate` | function | 88-115 | no |
| `isProviderName` | function | 32-34 | yes |
| `readEnvProviderName` | function | 77-86 | no |
| `selectProvider` | function | 49-75 | yes |

## Calls out
- `readEnvProviderName` → `isProviderName` (same file)
- `selectProvider` → `instantiate` (same file)
- `selectProvider` → [probeClaudeCode](/src/providers/claude-code.md)
- `selectProvider` → `readEnvProviderName` (same file)

## Called by
- `main` in [src/cli/classify-edges.ts](/src/cli/classify-edges.md)
- `parseArgs` in [src/cli/classify-edges.ts](/src/cli/classify-edges.md)
- `main` in [src/cli/compile-wiki.ts](/src/cli/compile-wiki.md)
- `parseArgs` in [src/cli/compile-wiki.ts](/src/cli/compile-wiki.md)
- `main` in [src/cli/extract-entities.ts](/src/cli/extract-entities.md)
- `parseArgs` in [src/cli/extract-entities.ts](/src/cli/extract-entities.md)
