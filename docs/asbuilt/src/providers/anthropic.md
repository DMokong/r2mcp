---
type: Module
title: src/providers/anthropic.ts
description: Skeleton concept for src/providers/anthropic.ts (extracted; 4 symbols).
resource: src/providers/anthropic.ts
tags:
  - src
  - module
  - class
  - method
enrichment: accuracy-audited
from:
  - BACKFILL-r2mcp-09
explains:
  - src/providers/anthropic.ts#AnthropicProvider
  - src/providers/anthropic.ts#AnthropicProvider.complete
  - src/providers/anthropic.ts#AnthropicProvider.constructor
  - src/providers/anthropic.ts#AnthropicProvider.priceForTokens
stale: false
stale_reason: ""
graph_hash: 722abd60fe9a14221204daed15ffc79c1ccb916aa2f11bc37b8d327971cb1d46
---

# Structure

## Exports
- `AnthropicProvider` (class, lines 26-71)

## Symbols
| Symbol | Kind | Span | Exported |
|---|---|---|---|
| `AnthropicProvider` | class | 26-71 | yes |
| `AnthropicProvider.complete` | method | 48-70 | yes |
| `AnthropicProvider.constructor` | method | 31-41 | yes |
| `AnthropicProvider.priceForTokens` | method | 43-46 | yes |

## Calls out
- `AnthropicProvider.complete` → `AnthropicProvider.priceForTokens` (same file)

# Explanation
This is the "reference" adapter of the three `LLMProvider` implementations — the other two adapters (OpenRouter, Claude Code) deliberately mirror its pricing table and model-mapping shape so that "cross-provider agreement" comparisons measure the quality of the abstraction rather than accidentally comparing different underlying model families. A future reader touching pricing should update `AnthropicProvider`'s `PRICES` table first and then check whether `OpenRouterProvider`'s copy needs to move in lockstep — they are currently two independent literal tables with no shared source of truth, so they can silently drift.

# Decisions
- (BACKFILL-r2mcp-09) `PRICES` and `MODEL_IDS` are plain module-level `Record<LogicalModel, ...>` constants, not symbols in the graph manifest (they weren't extracted as top-level declarations the tree- sitter pass indexes), so any future asbuilt work citing them needs to reference the containing method (`AnthropicProvider.priceForTokens`) rather than the table itself. The price comment says "public list price as of 2026-05" — this is a manually-maintained snapshot, not fetched from any API, so it will silently go stale as Anthropic's pricing changes; there's no expiry check or staleness warning anywhere in the code. The constructor accepting a pre-built `sdk` instance (bypassing the `apiKey` requirement entirely) exists purely for test injection — production code always goes through the `apiKey` path. There is no retry, no timeout, and no streaming support in `complete()`; a hung Anthropic API call will hang the caller indefinitely unless the caller wraps it externally (worth checking whether `selectProvider`'s consumers, e.g. the edge classifier, impose their own timeout).

# Citations
[1] BACKFILL-r2mcp-09 evidence: /Users/dustincheng/projects/claudeclaw/docs/specs/asbuilt-living-kb/evidence/backfill09-evidence.yml
