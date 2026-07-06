---
type: Module
title: src/edges/stage2-opus.ts
description: Skeleton concept for src/edges/stage2-opus.ts (extracted; 6 symbols).
resource: src/edges/stage2-opus.ts
tags:
  - src
  - module
  - function
  - interface
  - type
enrichment: accuracy-audited
from:
  - BACKFILL-r2mcp-06
explains:
  - src/edges/stage2-opus.ts#MemoryForClassify
  - src/edges/stage2-opus.ts#PairForClassify
  - src/edges/stage2-opus.ts#Stage2Result
  - src/edges/stage2-opus.ts#isRejectionPair
  - src/edges/stage2-opus.ts#parseStage2Response
  - src/edges/stage2-opus.ts#stage2OpusClassify
stale: false
stale_reason: ""
graph_hash: c192643d124600fd68491305707bec2b09c19febe0921e729af00e7c9e27905f
---

# Structure

## Exports
- `MemoryForClassify` (interface, lines 5-9)
- `PairForClassify` (interface, lines 11-14)
- `Stage2Result` (type, lines 16-23)
- `isRejectionPair` (function, lines 68-70)
- `parseStage2Response` (function, lines 72-100)
- `stage2OpusClassify` (function, lines 102-142)

## Symbols
| Symbol | Kind | Span | Exported |
|---|---|---|---|
| `MemoryForClassify` | interface | 5-9 | yes |
| `PairForClassify` | interface | 11-14 | yes |
| `Stage2Result` | type | 16-23 | yes |
| `isRejectionPair` | function | 68-70 | yes |
| `parseStage2Response` | function | 72-100 | yes |
| `stage2OpusClassify` | function | 102-142 | yes |

## Calls out
- `stage2OpusClassify` → `isRejectionPair` (same file)
- `stage2OpusClassify` → `parseStage2Response` (same file)
- `stage2OpusClassify` → [withLLMCallSpan](/src/telemetry.md)

## Called by
- `main` in [src/cli/classify-edges.ts](/src/cli/classify-edges.md)

# Explanation
Stage 2 is the only place in the whole pipeline that actually decides an `EdgeRelation` (or explicitly decides "no relation"). Everything upstream (candidate-pairs.ts, stage1-haiku.ts) exists to reduce the volume of pairs that reach this expensive, high-quality classification step. The function itself does not decide whether to persist the result — `classifier.ts#processPair` owns that gate (`relation !== 'none' && confidence > 0`).

# Decisions
- (BACKFILL-r2mcp-06) The AC10 rejection guard (`isRejectionPair` + the post-call downgrade block) is a belt-and-suspenders design: the system prompt already instructs the model never to classify a rejection-typed pair as `contradicts`, but the code does not trust that instruction to hold under all future prompt/model changes, so it re-checks the result after the fact and force-corrects it. This means the system prompt and the code-level guard are two independent defenses against the same failure mode — if you ever change the wording of the rejection-handling paragraph in `STAGE2_SYSTEM`, the code-level guard still protects correctness; if you ever remove or refactor `isRejectionPair`, you are removing the only defense that doesn't depend on the model behaving. The downgrade preserves the original LLM rationale (prefixed with `[AC10] downgraded...`) rather than discarding it, specifically so a human auditing why a rejection pair has no edge can see what the model actually thought before being overridden. `parseStage2Response`'s code-fence stripping and strict relation validation (throw on unknown relation, rather than coercing to `'none'`) mirror Stage 1's philosophy: fail loudly on unexpected model output rather than silently absorbing it into a default. Note `Stage2Result` is a single object type (not a union of "classified" vs "error" variants) despite having a `kind: 'classified'` discriminant field — that field currently has only one possible value, which reads as scaffolding for a future variant (e.g. a distinct "unparseable" result kind) that parse failures could return instead of throwing; as written today, parse failures always throw rather than producing an alternate `kind`.

# Citations
[1] BACKFILL-r2mcp-06 evidence: /Users/dustincheng/projects/claudeclaw/docs/specs/asbuilt-living-kb/evidence/backfill06-evidence.yml
