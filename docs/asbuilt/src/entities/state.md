---
type: Module
title: src/entities/state.ts
description: Skeleton concept for src/entities/state.ts (extracted; 10 symbols).
resource: src/entities/state.ts
tags:
  - src
  - module
  - class
  - interface
  - method
enrichment: accuracy-audited
from:
  - BACKFILL-r2mcp-07
explains:
  - src/entities/state.ts#EntityState
  - src/entities/state.ts#EntityState.appendRecord
  - src/entities/state.ts#EntityState.close
  - src/entities/state.ts#EntityState.constructor
  - src/entities/state.ts#EntityState.isMemoryTerminal
  - src/entities/state.ts#EntityState.loadTerminalSet
  - src/entities/state.ts#EntityState.recordParseFailed
  - src/entities/state.ts#EntityState.recordTerminal
  - src/entities/state.ts#EntityState.writeRunSummary
  - src/entities/state.ts#EntityStateInit
stale: false
stale_reason: ""
graph_hash: 722abd60fe9a14221204daed15ffc79c1ccb916aa2f11bc37b8d327971cb1d46
---

# Structure

## Exports
- `EntityState` (class, lines 23-117)
- `EntityStateInit` (interface, lines 13-17)

## Symbols
| Symbol | Kind | Span | Exported |
|---|---|---|---|
| `EntityState` | class | 23-117 | yes |
| `EntityState.appendRecord` | method | 104-106 | yes |
| `EntityState.close` | method | 108-110 | yes |
| `EntityState.constructor` | method | 29-36 | yes |
| `EntityState.isMemoryTerminal` | method | 56-58 | yes |
| `EntityState.loadTerminalSet` | method | 38-54 | yes |
| `EntityState.recordParseFailed` | method | 88-96 | yes |
| `EntityState.recordTerminal` | method | 72-80 | yes |
| `EntityState.writeRunSummary` | method | 112-116 | yes |
| `EntityStateInit` | interface | 13-17 | yes |

## Calls out
- `EntityState.constructor` → `EntityState.loadTerminalSet` (same file)
- `EntityState.recordParseFailed` → `EntityState.appendRecord` (same file)
- `EntityState.recordTerminal` → `EntityState.appendRecord` (same file)

## Called by
- `finalize` in [src/entities/extractor.ts](/src/entities/extractor.md)
- `finalize` in [src/entities/extractor.ts](/src/entities/extractor.md)
- `runExtractor` in [src/entities/extractor.ts](/src/entities/extractor.md)
- `runExtractor` in [src/entities/extractor.ts](/src/entities/extractor.md)
- `runExtractor` in [src/entities/extractor.ts](/src/entities/extractor.md)

# Explanation
EntityState is the crash-resumability layer for one extract_entities run — its entire reason for existing is that extraction is an expensive, potentially long-running, cost-capped LLM batch job that WILL sometimes be killed mid-run (Ctrl-C, hitting the cost cap deliberately, an unhandled crash), and re-running it from scratch would both re-spend money on already-processed memories and potentially create duplicate entities/links (though upsertEntity and linkMemoryToEntity are themselves idempotent, so resume here is mainly a cost-savings mechanism rather than a correctness requirement).

# Decisions
- (BACKFILL-r2mcp-07) This module is a near-exact structural echo of src/edges/state.ts's design (append-only per-record JSONL resume log, separate one-shot terminal JSON run summary) applied to a second, independent pipeline — the two are NOT the same class or shared code, they are parallel implementations of the same pattern, which matters if the pattern ever needs to change: a fix or improvement made in one (e.g. the batching TODO below) will not automatically apply to the other. The state file (entity-state.jsonl) is a SINGLE file shared across every run this pipeline has ever executed — it is never rotated, truncated, or compacted, and `loadTerminalSet` reads the ENTIRE file on every resume and filters in-memory to the matching run_id; resume cost therefore scales with the total historical row count across ALL runs ever, not just the run being resumed, and there is currently no cleanup story for this file's growth over the project's lifetime. Per-record synchronous flush (appendFileSync on every single append) is a deliberate durability-over-throughput choice with an explicit inline TODO (claw-2jbo finding 5) to batch flushes once corpus size exceeds ~1000 memories — anyone tempted to 'optimize' this to async/buffered writes is explicitly warned in the source to first get a benchmark on real backfill-scale load, since the sync-flush guarantee (a crash can only ever lose the currently-in-flight record) is the entire point of the design. `parse_failed` is excluded from the terminal set by design (see the inline comment at loadTerminalSet) so a resumed run automatically retries any memory whose response failed to parse — a bet that most parse failures are transient LLM formatting noise rather than a memory the model can never handle; there's no retry counter, so a memory that is PERMANENTLY unparseable would be retried on every future resume forever with no backoff or give-up mechanism.

# Citations
[1] BACKFILL-r2mcp-07 evidence: /Users/dustincheng/projects/claudeclaw/docs/specs/asbuilt-living-kb/evidence/backfill07-evidence.yml
