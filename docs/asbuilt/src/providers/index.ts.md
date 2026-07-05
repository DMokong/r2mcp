---
type: Module
title: src/providers/index.ts
description: Skeleton concept for src/providers/index.ts (extracted; 5 symbols).
resource: src/providers/index.ts
tags:
  - src
  - module
  - function
  - interface
enrichment: accuracy-audited
from:
  - BACKFILL-r2mcp-09
explains:
  - src/providers/index.ts#SelectProviderOptions
  - src/providers/index.ts#instantiate
  - src/providers/index.ts#isProviderName
  - src/providers/index.ts#readEnvProviderName
  - src/providers/index.ts#selectProvider
stale: false
stale_reason: ""
graph_hash: 722abd60fe9a14221204daed15ffc79c1ccb916aa2f11bc37b8d327971cb1d46
---

# Structure

## Exports
- `SelectProviderOptions` (interface, lines 36-47)
- `isProviderName` (function, lines 32-34)
- `selectProvider` (function, lines 49-75)

## Symbols
| Symbol | Kind | Span | Exported |
|---|---|---|---|
| `SelectProviderOptions` | interface | 36-47 | yes |
| `instantiate` | function | 88-115 | no |
| `isProviderName` | function | 32-34 | yes |
| `readEnvProviderName` | function | 77-86 | no |
| `selectProvider` | function | 49-75 | yes |

## Calls out
- `readEnvProviderName` → `isProviderName` (same file)
- `selectProvider` → `instantiate` (same file)
- `selectProvider` → [probeClaudeCode](/src/providers/claude-code.md)
- `selectProvider` → `readEnvProviderName` (same file)

## Called by
- `main` in [src/cli/classify-edges.ts](/src/cli/classify-edges.md)
- `parseArgs` in [src/cli/classify-edges.ts](/src/cli/classify-edges.md)
- `main` in [src/cli/compile-wiki.ts](/src/cli/compile-wiki.md)
- `parseArgs` in [src/cli/compile-wiki.ts](/src/cli/compile-wiki.md)
- `main` in [src/cli/extract-entities.ts](/src/cli/extract-entities.md)
- `parseArgs` in [src/cli/extract-entities.ts](/src/cli/extract-entities.md)

# Explanation
This file is the seam between "the outside world's idea of which provider to use" (a CLI flag, an env var, or nothing) and "a concrete, ready-to-call `LLMProvider` instance." Every CLI entry point that needs an LLM (`classify-edges.ts`, `compile-wiki.ts`, `extract-entities.ts`, per the bundle's "Called by" list) goes through `selectProvider` rather than constructing an adapter directly, which is what keeps provider choice a runtime concern instead of a compile-time one.

# Decisions
- (BACKFILL-r2mcp-09) The precedence order (explicit flag/env var > auto-probe) is deliberate and its auto-fallback sub-order (Claude Code first, then Anthropic, then OpenRouter) is a cost optimization, not an arbitrary list order — Claude Code is tried first specifically because it's free under a Max plan, so a logged-in user never pays per-call by default even if they also happen to have `ANTHROPIC_API_KEY` set in their shell. This means a stale or accidentally-set `ANTHROPIC_API_KEY` env var is silently *never used* if Claude Code login succeeds — that's intentional, but it can look like "my API key isn't being picked up" from a user's perspective; that's a common support question shape. `probeClaudeCode`'s result being injectable via `SelectProviderOptions.probeClaudeCode` (rather than always calling the real subprocess-spawning probe) is what makes `selectProvider`'s branches unit-testable without ever touching a real `claude` binary — the real probe module lives in `claude-code.ts`, deliberately decoupled from the decision logic here. `instantiate` and `readEnvProviderName` are unexported precisely because they're implementation details of the precedence logic, not part of the public contract — only `selectProvider`, `isProviderName`, and the re-exported adapters/types are meant to be imported by consumers. A subtlety worth flagging for anyone editing this file: `instantiate` is only invoked from the explicit-selection path (`flag` or `R2MCP_CLASSIFIER_PROVIDER`) — the auto-fallback branch constructs providers directly via the injected factories inside `selectProvider` itself, bypassing `instantiate` entirely, because its presence checks are already inline in the `if` conditions that select each branch. A refactor that tries to unify these two paths onto a single `instantiate` call needs to either move the auto-fallback's inline checks into `instantiate` or accept that `instantiate`'s validation becomes dead code on that path — they are not currently the same code path despite superficially doing similar-looking work.

# Citations
[1] BACKFILL-r2mcp-09 evidence: /Users/dustincheng/projects/claudeclaw/docs/specs/asbuilt-living-kb/evidence/backfill09-evidence.yml
