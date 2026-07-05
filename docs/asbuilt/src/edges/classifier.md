---
type: Module
title: src/edges/classifier.ts
description: Skeleton concept for src/edges/classifier.ts (extracted; 6 symbols).
resource: src/edges/classifier.ts
tags:
  - src
  - module
  - const
  - function
  - interface
enrichment: accuracy-audited
from:
  - BACKFILL-r2mcp-06
explains:
  - src/edges/classifier.ts#ClassifierDeps
  - src/edges/classifier.ts#RunOptions
  - src/edges/classifier.ts#launch
  - src/edges/classifier.ts#processPair
  - src/edges/classifier.ts#runClassifier
stale: false
stale_reason: ""
graph_hash: 722abd60fe9a14221204daed15ffc79c1ccb916aa2f11bc37b8d327971cb1d46
---

# Structure

## Exports
- `ClassifierDeps` (interface, lines 9-40)
- `RunOptions` (interface, lines 42-47)
- `launch` (const, lines 113-118)
- `runClassifier` (function, lines 65-154)

## Symbols
| Symbol | Kind | Span | Exported |
|---|---|---|---|
| `ClassifierDeps` | interface | 9-40 | yes |
| `Counters` | interface | 54-63 | no |
| `RunOptions` | interface | 42-47 | yes |
| `launch` | const | 113-118 | yes |
| `processPair` | function | 156-259 | no |
| `runClassifier` | function | 65-154 | yes |

## Calls out
- `launch` → `processPair` (same file)
- `launch` → [Semaphore.withPermit](/src/providers/semaphore.md)
- `processPair` → [StateStore.append](/src/edges/state.md)
- `processPair` → [pairHash](/src/edges/state.md)
- `processPair` → [RunSummaryWriter.write](/src/edges/state.md)
- `runClassifier` → [findCandidatePairs](/src/edges/candidate-pairs.md)
- `runClassifier` → `launch` (same file)
- `runClassifier` → [StateStore.markActiveRun](/src/edges/state.md)
- `runClassifier` → `processPair` (same file)
- `runClassifier` → [StateStore.terminalPairs](/src/edges/state.md)
- `runClassifier` → [Semaphore.withPermit](/src/providers/semaphore.md)
- `runClassifier` → [RunSummaryWriter.write](/src/edges/state.md)

## Called by
- `main` in [src/cli/classify-edges.ts](/src/cli/classify-edges.md)

# Explanation
This file is the orchestrator that ties candidate-pairs.ts, stage1-haiku.ts, stage2-opus.ts, and state.ts together into a resumable, cost-capped run. If you need to change how pairs are dispatched, how cost caps are enforced, or how resume/dry-run work, this is the file — the individual stage files know nothing about concurrency, cost caps, or persistence; those concerns live entirely here.

# Decisions
- (BACKFILL-r2mcp-06) Concurrency defaults to 1 specifically to preserve original SPEC-043 sequential behavior; the `Semaphore`-based worker pool (D.R6/D.AC8) is additive and only activates when a caller passes `concurrencyLimit` (e.g. from `LLMProvider.concurrencyLimit`) — don't assume concurrent dispatch is always on. Cost-cap checks are pre-call and approximate on purpose (flat `STAGE1_EST_COST_USD`/`STAGE2_EST_COST_USD` constants, not real token counts) — the code comment "Approximate under concurrency" acknowledges this is a soft cap that can be slightly overshot when multiple pairs are in flight, not a hard guarantee; if a strict budget matters, set `maxCostUsd` with headroom. A subtle trap for a future reader: `state.ts#StageRecord.stage` still includes `'rejection_skip'` as a terminal stage value, but `processPair` never writes it — the AC10 rejection guard now lives inside `stage2-opus.ts#stage2OpusClassify` (downgrading `contradicts` -> `none` post-call) and rejection pairs complete normally as `'opus_complete'` with a downgraded relation, not a distinct skip stage. `rejection_skip` is a superseded design that state.ts's type union hasn't been pruned to reflect — grep for it before assuming it's still live. The `s2.downgraded` stdout log in `processPair` ("AC10 GUARD: downgraded...") is observability only; by the time this branch runs, stage2-opus.ts has already made the downgrade decision, and this line does not itself change any state.

# Citations
[1] BACKFILL-r2mcp-06 evidence: /Users/dustincheng/projects/claudeclaw/docs/specs/asbuilt-living-kb/evidence/backfill06-evidence.yml
