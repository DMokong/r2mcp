---
type: Test
title: tests/providers/select-provider.test.ts
description: Skeleton concept for tests/providers/select-provider.test.ts
  (extracted; 1 symbols).
resource: tests/providers/select-provider.test.ts
tags:
  - tests
  - module
  - test
  - function
enrichment: accuracy-audited
from:
  - BACKFILL-r2mcp-14
explains:
  - tests/providers/select-provider.test.ts#fakeProvider
stale: false
stale_reason: ""
graph_hash: c192643d124600fd68491305707bec2b09c19febe0921e729af00e7c9e27905f
---

# Structure

## Symbols
| Symbol | Kind | Span | Exported |
|---|---|---|---|
| `fakeProvider` | function | 10-16 | no |

# Explanation
This suite is the single source of truth for the provider auto-selection precedence a user or operator experiences when running r2mcp's classifier without fully specifying a provider. A future reader touching src/providers/index.ts#selectProvider should treat the precedence order (flag > env var > auto-fallback: claude-code > anthropic > openrouter > error) as load-bearing UX, since it directly determines which provider silently gets used when multiple credentials happen to be present at once.

# Decisions
- (BACKFILL-r2mcp-14) The assertion that `probe` (probeClaudeCode) is NOT called when a flag or env var is present is a deliberately-tested negative — probing means launching a real `claude` subprocess, which is slow and would be wasted work (or could throw, in environments without the claude CLI installed) if the user already told the tool explicitly which provider to use. This is easy to accidentally regress if someone refactors selectProvider to "just always probe for logging purposes." The claude-code-first auto-fallback order (ahead of anthropic/openrouter) is a cost decision, not a capability one — claude-code is $0 under a Max plan, so it's preferred whenever a login session is detected, with the paid API providers as fallbacks. The full three-way remediation message (NO_PROVIDER_AVAILABLE_MESSAGE) is tested for containing all three providers' setup instructions verbatim — a future reader shortening or restructuring this message should keep re-running this suite, since it catches a dropped remediation path but not degraded phrasing within a path that survives.

# Citations
[1] BACKFILL-r2mcp-14 evidence: /Users/dustincheng/projects/claudeclaw/docs/specs/asbuilt-living-kb/evidence/backfill14-evidence.yml
