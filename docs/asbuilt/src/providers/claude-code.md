---
type: Module
title: src/providers/claude-code.ts
description: Skeleton concept for src/providers/claude-code.ts (extracted; 10 symbols).
resource: src/providers/claude-code.ts
tags:
  - src
  - module
  - class
  - function
  - interface
  - method
enrichment: none
from: []
explains: []
stale: false
stale_reason: ""
graph_hash: f3062700a89bb65b1df9622f69f7f24581224e0a7462079dc9cdb4a2395643c0
---

# Structure

## Exports
- `ClaudeCodeOptions` (interface, lines 31-38)
- `ClaudeCodeProvider` (class, lines 40-84)
- `parseClaudeJson` (function, lines 177-214)
- `probeClaudeCode` (function, lines 90-107)

## Symbols
| Symbol | Kind | Span | Exported |
|---|---|---|---|
| `ClaudeCodeOptions` | interface | 31-38 | yes |
| `ClaudeCodeProvider` | class | 40-84 | yes |
| `ClaudeCodeProvider.complete` | method | 59-76 | yes |
| `ClaudeCodeProvider.composePrompt` | method | 78-83 | yes |
| `ClaudeCodeProvider.constructor` | method | 49-57 | yes |
| `ClaudeJsonEnvelope` | interface | 172-175 | no |
| `parseClaudeJson` | function | 177-214 | yes |
| `probeClaudeCode` | function | 90-107 | yes |
| `runClaude` | function | 124-170 | no |
| `wrapSpawnError` | function | 114-122 | no |

## Calls out
- `ClaudeCodeProvider.complete` → `ClaudeCodeProvider.composePrompt` (same file)
- `ClaudeCodeProvider.complete` → `parseClaudeJson` (same file)
- `ClaudeCodeProvider.complete` → `runClaude` (same file)
- `probeClaudeCode` → `parseClaudeJson` (same file)
- `probeClaudeCode` → `runClaude` (same file)
- `runClaude` → [reject](/src/tools/reject.md)
- `runClaude` → `wrapSpawnError` (same file)

## Called by
- `selectProvider` in [src/providers/index.ts](/src/providers/index.ts.md)
