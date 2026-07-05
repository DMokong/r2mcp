---
type: Module
title: src/edges/state.ts
description: Skeleton concept for src/edges/state.ts (extracted; 11 symbols).
resource: src/edges/state.ts
tags:
  - src
  - module
  - class
  - function
  - interface
  - method
enrichment: accuracy-audited
from:
  - BACKFILL-r2mcp-02
explains:
  - src/edges/state.ts#RunSummaryWriter
  - src/edges/state.ts#RunSummaryWriter.write
  - src/edges/state.ts#StateStore
  - src/edges/state.ts#StateStore.append
  - src/edges/state.ts#StateStore.markActiveRun
  - src/edges/state.ts#StateStore.terminalPairs
  - src/edges/state.ts#pairHash
stale: false
stale_reason: ""
graph_hash: 722abd60fe9a14221204daed15ffc79c1ccb916aa2f11bc37b8d327971cb1d46
---

# Structure

## Exports
- `RunSummary` (interface, lines 76-92)
- `RunSummaryWriter` (class, lines 94-103)
- `StageRecord` (interface, lines 6-13)
- `StateStore` (class, lines 27-74)
- `pairHash` (function, lines 22-25)

## Symbols
| Symbol | Kind | Span | Exported |
|---|---|---|---|
| `RunSummary` | interface | 76-92 | yes |
| `RunSummaryWriter` | class | 94-103 | yes |
| `RunSummaryWriter.constructor` | method | 95-95 | yes |
| `RunSummaryWriter.write` | method | 97-102 | yes |
| `StageRecord` | interface | 6-13 | yes |
| `StateStore` | class | 27-74 | yes |
| `StateStore.append` | method | 33-36 | yes |
| `StateStore.constructor` | method | 28-31 | yes |
| `StateStore.markActiveRun` | method | 38-42 | yes |
| `StateStore.terminalPairs` | method | 49-73 | yes |
| `pairHash` | function | 22-25 | yes |

## Called by
- `main` in [src/cli/classify-edges.ts](/src/cli/classify-edges.md)
- `main` in [src/cli/compile-wiki.ts](/src/cli/compile-wiki.md)
- `main` in [src/cli/export-jsonl.ts](/src/cli/export-jsonl.md)
- `main` in [src/cli/extract-entities.ts](/src/cli/extract-entities.md)
- `runner` in [src/cli/extract-entities.ts](/src/cli/extract-entities.md)
- `main` in [src/cli/import-jsonl.ts](/src/cli/import-jsonl.md)
- `main` in [src/cli/lint-memory.ts](/src/cli/lint-memory.md)
- `runCompile` in [src/compiler/run.ts](/src/compiler/run.md)
- `processPair` in [src/edges/classifier.ts](/src/edges/classifier.md)
- `processPair` in [src/edges/classifier.ts](/src/edges/classifier.md)
- `processPair` in [src/edges/classifier.ts](/src/edges/classifier.md)
- `runClassifier` in [src/edges/classifier.ts](/src/edges/classifier.md)
- `runClassifier` in [src/edges/classifier.ts](/src/edges/classifier.md)
- `runClassifier` in [src/edges/classifier.ts](/src/edges/classifier.md)

# Explanation
state.ts is the crash-resumability backbone for the two-stage (cheap Haiku screen, then expensive Opus classify) edge-classification pipeline. Classification runs can be long, cost real money per LLM call, and get killed mid-run (Ctrl-C, OOM, hitting the cost cap); state.ts's job is ensuring a `resume_run_id` re-invocation picks up exactly where the prior run stopped without re-spending on pairs already resolved.

# Decisions
- (BACKFILL-r2mcp-02) `pairHash()` sorts the two input ids before hashing specifically so pair (A, B) and (B, A) hash identically — candidate pairs are inherently unordered, so without the sort, a resume could fail to recognize a pair it already finished if a later candidate-pairs generation pass produced it in the opposite order. The append-only JSONL design (one line per stage transition, never rewritten in place) is chosen for hard-kill safety: a process that dies mid-write can only corrupt the LAST line, never an earlier one, and `terminalPairs()` already handles a truncated final line explicitly — an in-place-update design would have needed careful fsync/rename-based atomic writes to get the same guarantee. `TERMINAL_STAGES` deliberately excludes `'haiku_pass'` — a pair that merely passed the cheap Haiku screen still needs the expensive Opus step, so only stages meaning "nothing more will happen to this pair" (`opus_complete`, `haiku_skip`, `cap_reached`, `rejection_skip`) stop it from being re-attempted on resume. `RunSummaryWriter` is a separate class from `StateStore` even though both persist run data, because they serve different readers at different times: `StateStore`'s JSONL is written incrementally DURING the run and is read back only by the SAME pipeline for resume; `RunSummaryWriter` writes one JSON file ONCE, at the end, for humans/dashboards/other tool responses (e.g. surfaced by the `classify` MCP tool) — conflating the two into one file would force resume-parsing logic to also understand a completed-summary shape.

# Citations
[1] BACKFILL-r2mcp-02 evidence: /Users/dustincheng/projects/claudeclaw/docs/specs/asbuilt-living-kb/evidence/backfill02-evidence.yml
