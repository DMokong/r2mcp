---
type: Module
title: src/providers/types.ts
description: Skeleton concept for src/providers/types.ts (extracted; 5 symbols).
resource: src/providers/types.ts
tags:
  - src
  - module
  - interface
  - type
enrichment: accuracy-audited
from:
  - BACKFILL-r2mcp-09
explains:
  - src/providers/types.ts#CompleteRequest
  - src/providers/types.ts#CompleteResponse
  - src/providers/types.ts#LLMProvider
  - src/providers/types.ts#LogicalModel
  - src/providers/types.ts#ProviderName
stale: false
stale_reason: ""
graph_hash: 722abd60fe9a14221204daed15ffc79c1ccb916aa2f11bc37b8d327971cb1d46
---

# Structure

## Exports
- `CompleteRequest` (interface, lines 12-17)
- `CompleteResponse` (interface, lines 19-26)
- `LLMProvider` (interface, lines 28-32)
- `LogicalModel` (type, lines 8-8)
- `ProviderName` (type, lines 10-10)

## Symbols
| Symbol | Kind | Span | Exported |
|---|---|---|---|
| `CompleteRequest` | interface | 12-17 | yes |
| `CompleteResponse` | interface | 19-26 | yes |
| `LLMProvider` | interface | 28-32 | yes |
| `LogicalModel` | type | 8-8 | yes |
| `ProviderName` | type | 10-10 | yes |

# Explanation
This is the contract file for the entire providers package — every adapter, `selectProvider`, and every external caller of an `LLMProvider` type-checks against these five declarations and nothing else. A future reader wanting to understand "what can an LLM call look like in this codebase" should start here before reading any adapter, since the adapters are just three different ways of fulfilling this same shape.

# Decisions
- (BACKFILL-r2mcp-09) `LogicalModel` is a closed three-value union (`haiku`/`opus`/`sonnet`) chosen to mirror Anthropic's tier naming even though two of the three adapters (OpenRouter, Claude Code) are not calling Anthropic's API directly for two of those calls — Claude Code's CLI accepts `claude-opus-4-7` etc., and OpenRouter maps to `anthropic/claude-*` slugs, so this union is really "Anthropic's three tiers," not a vendor-neutral abstraction; adding a non-Anthropic model family later would require widening this union and touching every adapter's `MODEL_IDS` table. `input_tokens`/`output_tokens`/`raw` on `CompleteResponse` are optional specifically because Claude Code's JSON envelope doesn't expose per-call token counts the way the Anthropic SDK and OpenRouter's API do — code consuming `CompleteResponse` for cost or usage analytics must handle the case where these fields are `undefined`, not assume they're always populated. `concurrencyLimit` is a readonly property fixed by each adapter's class definition (10, 10, 2) rather than a constructor parameter — a caller cannot ask an `AnthropicProvider` instance for a higher or lower limit without subclassing or forking the adapter; the intent is that these limits reflect real backend constraints (rate limits, subprocess overhead) rather than being a tunable the caller should override casually.

# Citations
[1] BACKFILL-r2mcp-09 evidence: /Users/dustincheng/projects/claudeclaw/docs/specs/asbuilt-living-kb/evidence/backfill09-evidence.yml
