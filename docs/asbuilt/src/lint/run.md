---
type: Module
title: src/lint/run.ts
description: Skeleton concept for src/lint/run.ts (extracted; 3 symbols).
resource: src/lint/run.ts
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
- `runLint` (function, lines 29-67)

## Symbols
| Symbol | Kind | Span | Exported |
|---|---|---|---|
| `applyFixes` | function | 98-133 | no |
| `buildSummary` | function | 74-87 | no |
| `runLint` | function | 29-67 | yes |

## Calls out
- `runLint` → `applyFixes` (same file)
- `runLint` → `buildSummary` (same file)
- `runLint` → [currentScope](/src/env.md)
- `runLint` → [findContradictions](/src/lint/checks/contradictions.md)
- `runLint` → [findDrift](/src/lint/checks/drift.md)
- `runLint` → [findOrphans](/src/lint/checks/orphans.md)
- `runLint` → [findStale](/src/lint/checks/stale.md)
- `runLint` → [findSupersededUnflagged](/src/lint/checks/superseded-unflagged.md)

## Called by
- `main` in [src/cli/lint-memory.ts](/src/cli/lint-memory.md)
- `lint` in [src/tools/lint.ts](/src/tools/lint.md)
- `meditate` in [src/tools/meditate.ts](/src/tools/meditate.md)
