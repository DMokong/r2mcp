---
type: Module
title: src/cli/classify-edges.ts
description: Skeleton concept for src/cli/classify-edges.ts (extracted; 3 symbols).
resource: src/cli/classify-edges.ts
tags:
  - src
  - module
  - function
  - interface
enrichment: accuracy-audited
from:
  - BACKFILL-r2mcp-04
explains:
  - src/cli/classify-edges.ts#CliArgs
  - src/cli/classify-edges.ts#main
  - src/cli/classify-edges.ts#parseArgs
stale: false
stale_reason: ""
graph_hash: c192643d124600fd68491305707bec2b09c19febe0921e729af00e7c9e27905f
---

# Structure

## Symbols
| Symbol | Kind | Span | Exported |
|---|---|---|---|
| `CliArgs` | interface | 55-61 | no |
| `main` | function | 88-160 | no |
| `parseArgs` | function | 63-86 | no |

## Calls out
- `main` → [closeDb](/src/db.md)
- `main` → [currentScope](/src/env.md)
- `main` → [findCandidatePairs](/src/edges/candidate-pairs.md)
- `main` → [getPool](/src/db.md)
- `main` → [initDb](/src/db.md)
- `main` → `parseArgs` (same file)
- `main` → [runClassifier](/src/edges/classifier.md)
- `main` → [selectProvider](/src/providers/index.ts.md)
- `main` → [stage1HaikuFilter](/src/edges/stage1-haiku.md)
- `main` → [stage2OpusClassify](/src/edges/stage2-opus.md)
- `main` → [withToolSpan](/src/telemetry.md)
- `parseArgs` → [isProviderName](/src/providers/index.ts.md)

# Explanation
This is the runnable CLI shell around the pure `runClassifier` pipeline (src/edges/classifier.ts): the pipeline itself takes no DB handle, no provider, and no filesystem path directly — every dependency is injected as a callback — and this file is the ONE place that supplies real Postgres, a real LLM provider, and real JSONL state files. A future reader modifying the classification algorithm should look at src/edges/classifier.ts; a future reader debugging 'why did this CLI invocation behave differently than the test suite' should look here, since this is where the seams get filled with production dependencies.

# Decisions
- (BACKFILL-r2mcp-04) Dry-run explicitly skips `selectProvider()` (`args.dryRun ? null : await selectProvider(...)`) rather than calling it and ignoring the result, because `selectProvider` throws `ProviderUnavailableError` when nothing is configured — a `--dry-run` cost estimate must work on a machine with zero LLM credentials configured, since its entire purpose is to let an operator gauge cost BEFORE deciding whether to set up a provider. The `estimateCost` formula (`pairs.length * 0.0005` for stage1, `pairs.length * 0.2 * 0.018` for stage2) bakes in an assumed 20% haiku-pass-through rate as a constant multiplier rather than measuring the actual pass rate live, so it is a rough estimate, not a live-metered projection — a real run can cost meaningfully more or less than the dry-run number if the actual candidate pool's pass rate differs from 20%. The `insertEdge` SQL is `ON CONFLICT (from_memory_id, to_memory_id, relation) DO UPDATE` rather than `DO NOTHING`, so re-classifying the same directed pair+relation (e.g. via `--resume` after a state file was manually edited, or a legitimate reclassification from `lint --fix`'s `reclassify` action) intentionally overwrites confidence/rationale/classifier_version with the newer result rather than preserving the first-ever classification. `R2MCP_CLASSIFIER_PROVIDER` (read inside `selectProvider`, not in this file) sits between the `--provider` flag and the auto-fallback chain in precedence — this file only ever supplies the flag, so provider resolution logic itself lives entirely in src/providers/index.ts and should not be duplicated here.

# Citations
[1] BACKFILL-r2mcp-04 evidence: /Users/dustincheng/projects/claudeclaw/docs/specs/asbuilt-living-kb/evidence/backfill04-evidence.yml
