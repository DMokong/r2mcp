---
type: Module
title: src/compiler/types.ts
description: Skeleton concept for src/compiler/types.ts (extracted; 9 symbols).
resource: src/compiler/types.ts
tags:
  - src
  - module
  - interface
  - type
enrichment: accuracy-audited
from:
  - BACKFILL-r2mcp-05
explains:
  - src/compiler/types.ts#CompileFrontmatter
  - src/compiler/types.ts#CompileManifest
  - src/compiler/types.ts#CompileSectionResult
  - src/compiler/types.ts#CompileSummary
  - src/compiler/types.ts#CompileTierInput
  - src/compiler/types.ts#CompileTopicInput
  - src/compiler/types.ts#EdgeForCompile
  - src/compiler/types.ts#MemoryForCompile
  - src/compiler/types.ts#Tier
stale: false
stale_reason: ""
graph_hash: c192643d124600fd68491305707bec2b09c19febe0921e729af00e7c9e27905f
---

# Structure

## Exports
- `CompileFrontmatter` (interface, lines 44-53)
- `CompileManifest` (interface, lines 104-111)
- `CompileSectionResult` (interface, lines 75-86)
- `CompileSummary` (interface, lines 88-102)
- `CompileTierInput` (interface, lines 55-64)
- `CompileTopicInput` (interface, lines 66-73)
- `EdgeForCompile` (interface, lines 30-42)
- `MemoryForCompile` (interface, lines 10-28)
- `Tier` (type, lines 7-7)

## Symbols
| Symbol | Kind | Span | Exported |
|---|---|---|---|
| `CompileFrontmatter` | interface | 44-53 | yes |
| `CompileManifest` | interface | 104-111 | yes |
| `CompileSectionResult` | interface | 75-86 | yes |
| `CompileSummary` | interface | 88-102 | yes |
| `CompileTierInput` | interface | 55-64 | yes |
| `CompileTopicInput` | interface | 66-73 | yes |
| `EdgeForCompile` | interface | 30-42 | yes |
| `MemoryForCompile` | interface | 10-28 | yes |
| `Tier` | type | 7-7 | yes |

# Explanation
This file has zero runtime behavior but is the actual coupling surface of the whole compiler subsystem — every cross-file relationship in tier.ts / topic.ts / prompts.ts / manifest.ts / frontmatter.ts / run.ts is expressed as one of these interfaces. A future reader trying to understand "how do tier.ts and topic.ts share a cost budget across a single --all run" should start here, not in run.ts: the answer is that `CompileTierInput`/`CompileTopicInput` both declare `costMeter: { totalCostUsd: number; hitCap: boolean }` as a plain object type (not a class), and `run.ts` constructs exactly one such object and passes the *same reference* into every sequential `compileTier`/`compileTopic` call — the type declaration alone doesn't show that mutation-by-reference is the mechanism; only reading run.ts's call sites reveals it.

# Decisions
- (BACKFILL-r2mcp-05) Two non-obvious modeling choices: (1) `MemoryForCompile.event_date` is `string | null | undefined` (optional AND nullable) rather than just optional — the code that consumes it (`clustering.ts#effectiveDate`) treats `m.event_date || m.created_at`, which means an empty string would also fall through to `created_at` even though that's not really "absent" in the type sense; this is a permissive-by-accident code path rather than a deliberately handled third state. (2) `CompileSectionResult.partial` is a boolean, not an enum of *why* it's partial (cost cap vs. some future reason) — right now the only producer of `partial=true` is the cost-cap check in tier.ts/topic.ts, so `CompileSummary.hit_cost_cap` and a section's `partial` are currently always in lockstep, but the type doesn't encode that correlation; if a second reason to mark a section partial is ever added, the `hit_cost_cap` name in `CompileSummary` will become misleading (it will no longer mean "the only possible cause of any partial section") and should be revisited alongside this type.

# Citations
[1] BACKFILL-r2mcp-05 evidence: /Users/dustincheng/projects/claudeclaw/docs/specs/asbuilt-living-kb/evidence/backfill05-evidence.yml
