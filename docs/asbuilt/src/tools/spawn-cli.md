---
type: Module
title: src/tools/spawn-cli.ts
description: Skeleton concept for src/tools/spawn-cli.ts (extracted; 4 symbols).
resource: src/tools/spawn-cli.ts
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
- `CliScriptName` (type, lines 16-20)
- `ResolvedCli` (interface, lines 22-25)
- `resolveCliCommand` (function, lines 31-33)
- `resolveCliCommandForUrl` (function, lines 38-58)

## Symbols
| Symbol | Kind | Span | Exported |
|---|---|---|---|
| `CliScriptName` | type | 16-20 | yes |
| `ResolvedCli` | interface | 22-25 | yes |
| `resolveCliCommand` | function | 31-33 | yes |
| `resolveCliCommandForUrl` | function | 38-58 | yes |

## Calls out
- `resolveCliCommand` → `resolveCliCommandForUrl` (same file)

## Called by
- `classify` in [src/tools/classify.ts](/src/tools/classify.md)
- `compile` in [src/tools/compile.ts](/src/tools/compile.md)
- `extractEntitiesTool` in [src/tools/extract-entities.ts](/src/tools/extract-entities.md)
