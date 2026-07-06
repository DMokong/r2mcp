---
type: Module
title: src/providers/errors.ts
description: Skeleton concept for src/providers/errors.ts (extracted; 2 symbols).
resource: src/providers/errors.ts
tags:
  - src
  - module
  - class
  - method
enrichment: accuracy-audited
from:
  - BACKFILL-r2mcp-09
explains:
  - src/providers/errors.ts#ProviderUnavailableError
  - src/providers/errors.ts#ProviderUnavailableError.constructor
stale: false
stale_reason: ""
graph_hash: c192643d124600fd68491305707bec2b09c19febe0921e729af00e7c9e27905f
---

# Structure

## Exports
- `ProviderUnavailableError` (class, lines 6-11)

## Symbols
| Symbol | Kind | Span | Exported |
|---|---|---|---|
| `ProviderUnavailableError` | class | 6-11 | yes |
| `ProviderUnavailableError.constructor` | method | 7-10 | yes |

# Explanation
A single-purpose module holding only the provider-selection failure type and its remediation message, split out from the adapter files so that any code needing to catch `ProviderUnavailableError` (e.g. a CLI's top-level error handler) doesn't have to pull in `@anthropic-ai/sdk` or Node's `child_process` transitively just to reference an error class.

# Decisions
- (BACKFILL-r2mcp-09) `NO_PROVIDER_AVAILABLE_MESSAGE`'s exact wording is load-bearing, not cosmetic — the in-source comment ties it directly to an acceptance criterion (D.AC4) requiring all three remediation paths (Claude Code login, `ANTHROPIC_API_KEY`, `R2MCP_OPENROUTER_API_KEY`) to be named in the message. A future edit that rewords this message (even to make it "friendlier") risks silently breaking a test that asserts on message content or a substring of it — check for such an assertion before editing this string. The class deliberately carries no structured fields (no `code`, no `cause` in the constructor signature) — it's a marker type for "no provider configured," not a general-purpose provider-error wrapper; other provider failures (bad API key, network error, non-2xx response) surface as plain `Error`s from inside the adapters themselves, not as `ProviderUnavailableError`.

# Citations
[1] BACKFILL-r2mcp-09 evidence: /Users/dustincheng/projects/claudeclaw/docs/specs/asbuilt-living-kb/evidence/backfill09-evidence.yml
