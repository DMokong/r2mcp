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
stale_reason: ""
graph_hash: f3062700a89bb65b1df9622f69f7f24581224e0a7462079dc9cdb4a2395643c0
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
