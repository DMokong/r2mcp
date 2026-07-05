---
type: Module
title: src/compiler/tier.ts
description: Skeleton concept for src/compiler/tier.ts (extracted; 2 symbols).
resource: src/compiler/tier.ts
tags:
  - src
  - module
  - function
enrichment: accuracy-audited
from:
  - BACKFILL-r2mcp-05
explains:
  - src/compiler/tier.ts#compileTier
  - src/compiler/tier.ts#estimatedCallCost
stale: false
stale_reason: ""
graph_hash: 722abd60fe9a14221204daed15ffc79c1ccb916aa2f11bc37b8d327971cb1d46
---

# Structure

## Exports
- `compileTier` (function, lines 23-93)

## Symbols
| Symbol | Kind | Span | Exported |
|---|---|---|---|
| `compileTier` | function | 23-93 | yes |
| `estimatedCallCost` | function | 100-102 | no |

## Calls out
- `compileTier` → [clusterByTopic](/src/compiler/clustering.md)
- `compileTier` → `estimatedCallCost` (same file)
- `compileTier` → [tierClusterUserPrompt](/src/compiler/prompts.md)
- `compileTier` → [tierSystemPrompt](/src/compiler/prompts.md)
- `compileTier` → [topicTitle](/src/compiler/clustering.md)
- `compileTier` → [withLLMCallSpan](/src/telemetry.md)

## Called by
- `runCompile` in [src/compiler/run.ts](/src/compiler/run.md)

# Explanation
`compileTier` produces exactly one of the three fixed tier wiki pages (preferences.md / project-context.md / conversations.md). It's the simpler of the two synthesis paths (compare topic.ts): one cluster maps to exactly one `###` subsection, there's no multi-section-per-cluster structure, and there's no deterministic non-LLM section the way topic.ts has Timeline — every bit of tier.ts's rendered prose is model output, so an empty-memories tier is the only case with zero LLM cost.

# Decisions
- (BACKFILL-r2mcp-05) The cost-cap logic is the part most likely to bite someone extending this file: there are two guard checks before each LLM call (already-over-cap, and would-this-call-push-us-over using `estimatedCallCost()`'s hardcoded $0.003), and either one sets `partial=true` + breaks the loop — meaning a tier can render only some of its clusters and still return `cost_usd`/`partial` as a normal, non-error outcome (`run.ts` writes whatever was produced and reports `hit_cost_cap` in the summary rather than failing the run). `estimatedCallCost()`'s $0.003 figure is a hand-computed, hardcoded conservative reserve based on Haiku list pricing for the current `MAX_TOKENS_PER_CLUSTER=400` budget — if that token budget ever changes, this constant needs to be recomputed by hand; it is not derived from `MAX_TOKENS_PER_CLUSTER` programmatically, so the two can silently drift out of sync. Note also that `topic.ts#compileTopic` independently hardcodes the *same* `0.003` literal inline for its own, different, 500-token budget rather than importing `estimatedCallCost` (which isn't exported) — this reads as unintentional duplication rather than a considered decision to share one flat per-call reserve across two different token budgets; a future reader tightening the cost cap should treat these as two places to update, not one.

# Citations
[1] BACKFILL-r2mcp-05 evidence: /Users/dustincheng/projects/claudeclaw/docs/specs/asbuilt-living-kb/evidence/backfill05-evidence.yml
