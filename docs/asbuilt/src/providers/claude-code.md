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
enrichment: accuracy-audited
from:
  - BACKFILL-r2mcp-09
explains:
  - src/providers/claude-code.ts#ClaudeCodeProvider
  - src/providers/claude-code.ts#ClaudeCodeProvider.complete
  - src/providers/claude-code.ts#ClaudeCodeProvider.composePrompt
  - src/providers/claude-code.ts#ClaudeCodeProvider.constructor
  - src/providers/claude-code.ts#parseClaudeJson
  - src/providers/claude-code.ts#probeClaudeCode
  - src/providers/claude-code.ts#runClaude
  - src/providers/claude-code.ts#wrapSpawnError
stale: false
stale_reason: ""
graph_hash: 722abd60fe9a14221204daed15ffc79c1ccb916aa2f11bc37b8d327971cb1d46
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

# Explanation
This adapter exists specifically so r2mcp's LLM-backed features (edge classification, wiki compilation) can run at zero marginal cost for users on a Claude Max subscription, by shelling out to the same `claude` CLI a human would use interactively rather than calling the metered Anthropic API. It is the most operationally fragile of the three adapters because it depends on an external binary being installed, on PATH, and already authenticated (`claude /login`) — none of which the adapter itself can guarantee or fix, it can only fail with an actionable message.

# Decisions
- (BACKFILL-r2mcp-09) `cost_usd` is hardcoded to `0` rather than computed, and the code comment explicitly flags this as a strict-equality contract point (D.AC5) — a future refactor that tries to "improve" this into an estimate based on token counts would break that acceptance criterion; token counts aren't even available from the CLI's JSON envelope, so an estimate wouldn't be possible without shelling out differently. The `R2MCP_CLAUDE_BIN` env var escape hatch (and `wrapSpawnError`'s ENOENT-specific message, referencing bug claw-8cjf.7) exists because launchd jobs and MCP host processes commonly inherit a sanitized `PATH` that omits `~/.local/bin` or wherever `claude` actually lives — this was learned the hard way in production, not designed upfront, per the inline comment trail. `parseClaudeJson` accepts two different envelope shapes (`{result: string}` or `{messages: [...]}`) because the CLI's `--output-format=json` shape has changed across CLI versions; this defensive dual-parsing is a version-compat shim, not speculative generality — if the CLI's format changes again, extend this function's fallback chain rather than picking one shape and dropping the other. `runTimeoutMs` defaults to 120s (much longer than the 5s `probeClaudeCode` timeout) because a real completion call can involve substantial generation time, whereas the probe just needs to confirm login state fast; conflating these two timeouts would make either normal calls time out prematurely or make login-detection sluggish.

# Citations
[1] BACKFILL-r2mcp-09 evidence: /Users/dustincheng/projects/claudeclaw/docs/specs/asbuilt-living-kb/evidence/backfill09-evidence.yml
