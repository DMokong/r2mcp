---
type: Module
title: src/providers/openrouter.ts
description: Skeleton concept for src/providers/openrouter.ts (extracted; 6 symbols).
resource: src/providers/openrouter.ts
tags:
  - src
  - module
  - class
  - interface
  - method
  - type
enrichment: accuracy-audited
from:
  - BACKFILL-r2mcp-09
explains:
  - src/providers/openrouter.ts#OpenRouterOptions
  - src/providers/openrouter.ts#OpenRouterProvider
  - src/providers/openrouter.ts#OpenRouterProvider.complete
  - src/providers/openrouter.ts#OpenRouterProvider.constructor
  - src/providers/openrouter.ts#OpenRouterProvider.priceForTokens
stale: false
stale_reason: ""
graph_hash: 722abd60fe9a14221204daed15ffc79c1ccb916aa2f11bc37b8d327971cb1d46
---

# Structure

## Exports
- `OpenRouterOptions` (interface, lines 33-38)
- `OpenRouterProvider` (class, lines 40-104)

## Symbols
| Symbol | Kind | Span | Exported |
|---|---|---|---|
| `FetchFn` | type | 31-31 | no |
| `OpenRouterOptions` | interface | 33-38 | yes |
| `OpenRouterProvider` | class | 40-104 | yes |
| `OpenRouterProvider.complete` | method | 63-103 | yes |
| `OpenRouterProvider.constructor` | method | 48-56 | yes |
| `OpenRouterProvider.priceForTokens` | method | 58-61 | yes |

## Calls out
- `OpenRouterProvider.complete` → `OpenRouterProvider.priceForTokens` (same file)

# Explanation
OpenRouter is the third and most manual of the three fallback tiers — no vendor SDK, just hand-rolled `fetch` against an OpenAI-compatible endpoint. It exists as the last-resort option in `selectProvider`'s auto-fallback chain for users who have neither Claude Code login nor a direct Anthropic key, but do have an OpenRouter account (useful for evaluating multiple model providers/vendors through one API surface, or as a fallback during an Anthropic outage).

# Decisions
- (BACKFILL-r2mcp-09) Pricing intentionally reuses the same Anthropic list-price table as `AnthropicProvider` rather than OpenRouter's own reported per-request cost — the file comment explains this is so that a "cross-provider agreement" evaluation (comparing Anthropic-direct vs Claude-Code-headless vs OpenRouter responses to the same prompt) measures agreement in the abstraction layer, not incidental pricing differences, with an explicit escape hatch noted for operators to override if OpenRouter applies a markup — though no such override mechanism is actually implemented yet, only mentioned in the comment; a future reader should not assume an env var for this exists without checking. The `HTTP-Referer`/`X-Title` headers are OpenRouter-specific app-attribution conventions (not authentication) — removing them won't break auth but will make the calls show up unattributed in OpenRouter's dashboard. Error responses truncate the body to 400 characters before embedding it in the thrown `Error` — this is a deliberate bound against enormous HTML error pages showing up in logs, not an oversight; if OpenRouter's error payloads are ever needed in full for debugging, this is where to look first. `endpoint` and `fetchFn` are constructor-injectable purely for tests; there's no retry/backoff on transient 5xx responses.

# Citations
[1] BACKFILL-r2mcp-09 evidence: /Users/dustincheng/projects/claudeclaw/docs/specs/asbuilt-living-kb/evidence/backfill09-evidence.yml
