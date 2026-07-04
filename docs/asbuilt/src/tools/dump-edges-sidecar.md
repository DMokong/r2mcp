---
type: Module
title: src/tools/dump-edges-sidecar.ts
description: Skeleton concept for src/tools/dump-edges-sidecar.ts (extracted; 5 symbols).
resource: src/tools/dump-edges-sidecar.ts
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
- `DumpEdgesInput` (interface, lines 16-19)
- `DumpEdgesOutput` (interface, lines 21-25)
- `dumpEdgesJson` (function, lines 93-103)
- `dumpEdgesJsonWithClient` (function, lines 32-87)
- `dumpEdgesSidecarTool` (function, lines 109-114)

## Symbols
| Symbol | Kind | Span | Exported |
|---|---|---|---|
| `DumpEdgesInput` | interface | 16-19 | yes |
| `DumpEdgesOutput` | interface | 21-25 | yes |
| `dumpEdgesJson` | function | 93-103 | yes |
| `dumpEdgesJsonWithClient` | function | 32-87 | yes |
| `dumpEdgesSidecarTool` | function | 109-114 | yes |

## Calls out
- `dumpEdgesJson` → `dumpEdgesJsonWithClient` (same file)
- `dumpEdgesSidecarTool` → `dumpEdgesJson` (same file)

## Called by
- `main` in [src/cli/dump-edges-json.ts](/src/cli/dump-edges-json.md)
