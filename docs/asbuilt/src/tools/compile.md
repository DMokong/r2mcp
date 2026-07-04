---
type: Module
title: src/tools/compile.ts
description: Skeleton concept for src/tools/compile.ts (extracted; 8 symbols).
resource: src/tools/compile.ts
enrichment: none
from: []
explains: []
stale: false
graph_hash: 77d367245d49ace6ef0672a008ab019becccb6dbdf36b1e5dba5e4679096f6d2
---

# Structure

## Exports
- `CompileToolDeps` (interface, lines 26-33)
- `CompileToolInput` (interface, lines 15-24)
- `compile` (function, lines 35-49)
- `compileCliPath` (function, lines 162-164)

## Symbols
| Symbol | Kind | Span | Exported |
|---|---|---|---|
| `CompileToolDeps` | interface | 26-33 | yes |
| `CompileToolInput` | interface | 15-24 | yes |
| `buildArgs` | function | 58-67 | no |
| `compile` | function | 35-49 | yes |
| `compileCliPath` | function | 162-164 | yes |
| `parseSummary` | function | 110-159 | no |
| `runSubprocess` | function | 69-108 | no |
| `validateInput` | function | 51-56 | no |

## Calls out
- `compile` → `buildArgs` (same file)
- `compile` → `parseSummary` (same file)
- `compile` → [resolveCliCommand](/src/tools/spawn-cli.md)
- `compile` → `runSubprocess` (same file)
- `compile` → `validateInput` (same file)
