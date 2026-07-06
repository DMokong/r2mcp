---
type: Module
title: src/compiler/topic.ts
description: Skeleton concept for src/compiler/topic.ts (extracted; 2 symbols).
resource: src/compiler/topic.ts
tags:
  - src
  - module
  - function
enrichment: accuracy-audited
from:
  - BACKFILL-r2mcp-05
explains:
  - src/compiler/topic.ts#compileTopic
  - src/compiler/topic.ts#sectionMemoryIds
stale: false
stale_reason: ""
graph_hash: c192643d124600fd68491305707bec2b09c19febe0921e729af00e7c9e27905f
---

# Structure

## Exports
- `compileTopic` (function, lines 24-114)

## Symbols
| Symbol | Kind | Span | Exported |
|---|---|---|---|
| `compileTopic` | function | 24-114 | yes |
| `sectionMemoryIds` | function | 116-125 | no |

## Calls out
- `compileTopic` → [effectiveDate](/src/compiler/clustering.md)
- `compileTopic` → [memoriesForTopic](/src/compiler/clustering.md)
- `compileTopic` → `sectionMemoryIds` (same file)
- `compileTopic` → [topicSectionUserPrompt](/src/compiler/prompts.md)
- `compileTopic` → [topicSystemPrompt](/src/compiler/prompts.md)
- `compileTopic` → [withLLMCallSpan](/src/telemetry.md)

## Called by
- `runCompile` in [src/compiler/run.ts](/src/compiler/run.md)

# Explanation
`compileTopic` produces a single topic wiki page with a fixed four-section shape (Summary / Key Decisions / Open Questions / Timeline). Unlike tier.ts, three of its four sections come from the model and one — Timeline — is built entirely from data with no LLM involvement, specifically so a topic page always has *some* real, useful, guaranteed-present content (actual dated events) even in the worst case where the model produces nothing useful for the synthesized sections or the run hits its cost cap partway through.

# Decisions
- (BACKFILL-r2mcp-05) Two things a future reader will want to know before touching this file: (1) Timeline is explicitly skipped whenever `partial` is already `true` from an earlier section hitting the cost cap (`if (!partial) { ... }`) — a cost-capped topic page can therefore end up with fewer than four sections, and specifically loses the free, zero-cost Timeline section rather than keeping it, because Timeline is checked last in the code, not cheapest-first; a future revision that wants to guarantee Timeline survives a cost cap would need to move that check earlier. (2) `sectionMemoryIds` currently returns the identical memory-id set for Summary, Key Decisions, and Open Questions — the code comment calls this out as a placeholder ("a future refinement can attribute differently per section") rather than a bug, chosen because "same set for every section" is trivially stable across compile runs, whereas any per-section attribution logic would need its own stability guarantee. Anyone changing this to real per-section attribution must re-verify B.R5/B.AC3 stability holds for the new logic, not just copy the existing all-memories behavior.

# Citations
[1] BACKFILL-r2mcp-05 evidence: /Users/dustincheng/projects/claudeclaw/docs/specs/asbuilt-living-kb/evidence/backfill05-evidence.yml
