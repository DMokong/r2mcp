---
type: Module
title: src/compiler/manifest.ts
description: Skeleton concept for src/compiler/manifest.ts (extracted; 5 symbols).
resource: src/compiler/manifest.ts
tags:
  - src
  - module
  - function
enrichment: accuracy-audited
from:
  - BACKFILL-r2mcp-05
explains:
  - src/compiler/manifest.ts#computeStaleFiles
  - src/compiler/manifest.ts#deleteStaleFiles
  - src/compiler/manifest.ts#manifestPath
  - src/compiler/manifest.ts#readManifest
  - src/compiler/manifest.ts#writeManifest
stale: false
stale_reason: ""
graph_hash: c192643d124600fd68491305707bec2b09c19febe0921e729af00e7c9e27905f
---

# Structure

## Exports
- `computeStaleFiles` (function, lines 56-82)
- `deleteStaleFiles` (function, lines 84-91)
- `manifestPath` (function, lines 16-18)
- `readManifest` (function, lines 20-29)
- `writeManifest` (function, lines 31-39)

## Symbols
| Symbol | Kind | Span | Exported |
|---|---|---|---|
| `computeStaleFiles` | function | 56-82 | yes |
| `deleteStaleFiles` | function | 84-91 | yes |
| `manifestPath` | function | 16-18 | yes |
| `readManifest` | function | 20-29 | yes |
| `writeManifest` | function | 31-39 | yes |

## Calls out
- `readManifest` → `manifestPath` (same file)
- `writeManifest` → `manifestPath` (same file)

## Called by
- `runCompile` in [src/compiler/run.ts](/src/compiler/run.md)
- `runCompile` in [src/compiler/run.ts](/src/compiler/run.md)

# Explanation
The compile manifest (`memory/compiled/manifest.json`) is the only durable record of "what files did the last compile run produce, and from which memory IDs." Its entire reason to exist is enabling safe partial recompiles: `compile --tier=preferences` should be able to delete a preferences.md that's no longer warranted without touching topic pages or other tiers it never looked at. This module is intentionally "dumb" — it has no opinion about tiers or topics beyond bookkeeping; `run.ts` (the orchestrator) is what decides what's "in scope" for a given run and passes that scope in.

# Decisions
- (BACKFILL-r2mcp-05) The one decision a future reader absolutely needs: `readManifest` swallows JSON.parse errors and returns `null` for BOTH "no manifest file exists yet" and "manifest file is corrupt" — there is no way from the return value alone to tell those two cases apart. In practice a corrupted manifest.json silently resets the incremental-compile state to "first run ever," which is safe (worst case, some stale files that should have been deleted just don't get deleted until the next full compile) but also means a corruption bug here would never surface as an error — it would surface much later as "why didn't this old topic page get cleaned up." Also worth knowing: `computeStaleFiles`'s tier-scope check (plain membership in `scope.tiers`) and its topic-scope check (`allTopics` vs `scope.topics.includes(t.topic)`) are asymmetric on purpose — tiers only ever run as a single named tier or ALL of them, so there's no "allTiers" branch the way there's an `allTopics` branch, even though the parallel type shape might tempt someone to assume tiers and topics are handled identically. Read `run.ts`'s `mergeManifest`/ scope-building alongside this file if you're changing cleanup behavior, not this file in isolation.

# Citations
[1] BACKFILL-r2mcp-05 evidence: /Users/dustincheng/projects/claudeclaw/docs/specs/asbuilt-living-kb/evidence/backfill05-evidence.yml
