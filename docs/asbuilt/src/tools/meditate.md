---
type: Module
title: src/tools/meditate.ts
description: Skeleton concept for src/tools/meditate.ts (extracted; 8 symbols).
resource: src/tools/meditate.ts
tags:
  - src
  - module
  - function
  - interface
enrichment: accuracy-audited
from:
  - BACKFILL-r2mcp-03
explains:
  - src/tools/meditate.ts#MeditateInput
  - src/tools/meditate.ts#MeditateResult
  - src/tools/meditate.ts#archiveStale
  - src/tools/meditate.ts#countCrossReferencePairs
  - src/tools/meditate.ts#countDuplicateFingerprints
  - src/tools/meditate.ts#countTopicClusters
  - src/tools/meditate.ts#meditate
  - src/tools/meditate.ts#surfaceGaps
stale: false
stale_reason: ""
graph_hash: 722abd60fe9a14221204daed15ffc79c1ccb916aa2f11bc37b8d327971cb1d46
---

# Structure

## Exports
- `MeditateInput` (interface, lines 7-16)
- `MeditateResult` (interface, lines 18-30)
- `meditate` (function, lines 32-76)

## Symbols
| Symbol | Kind | Span | Exported |
|---|---|---|---|
| `MeditateInput` | interface | 7-16 | yes |
| `MeditateResult` | interface | 18-30 | yes |
| `archiveStale` | function | 84-119 | no |
| `countCrossReferencePairs` | function | 150-172 | no |
| `countDuplicateFingerprints` | function | 125-144 | no |
| `countTopicClusters` | function | 178-192 | no |
| `meditate` | function | 32-76 | yes |
| `surfaceGaps` | function | 198-216 | no |

## Calls out
- `meditate` → `archiveStale` (same file)
- `meditate` → `countCrossReferencePairs` (same file)
- `meditate` → `countDuplicateFingerprints` (same file)
- `meditate` → `countTopicClusters` (same file)
- `meditate` → [currentScope](/src/env.md)
- `meditate` → [getPool](/src/db.md)
- `meditate` → [runLint](/src/lint/run.md)
- `meditate` → `surfaceGaps` (same file)
- `meditate` → [triggerGraphRebuild](/src/graph-rebuild.md)

# Explanation
meditate() is the periodic memory-maintenance sweep: it archives stale rows and, separately, counts (without acting on) duplicates, cross-reference candidates, topic clusters, and preference/project-context documentation gaps. The four count-only helpers are explicitly informational per the code's own "Phase 2" comments — they report a number for visibility but don't create edges, merge duplicates, or write docs themselves; that work happens elsewhere (classify() creates edges, compile() writes docs).

# Decisions
- (BACKFILL-r2mcp-03) `archiveStale` is the only helper with a real write side effect (`UPDATE ... SET type='archived'`), and it alone respects `dry_run`; the four count helpers are read-only regardless of `dry_run` because there's nothing to simulate about a `COUNT(*)`. The archival thresholds are intentionally asymmetric — conversations age out after 90 days, project-context after 180, and preferences never auto-archive — reflecting how durable each tier's content is expected to be (session chit-chat vs. architecture notes vs. standing preferences). `triggerGraphRebuild` only fires when `!dry_run && projectRoot` is supplied; `projectRoot` is optional because not every caller (e.g. a bare unit test) wants or has a ClaudeClaw-specific graph-build side effect, and `triggerGraphRebuild` itself (in `src/graph-rebuild.ts`) silently no-ops if `scripts/build-memory-graph.js` isn't present in that root, since r2mcp treats the graph script as a ClaudeClaw-only extension rather than a core dependency. `include_lint` defaults to `false` specifically to keep the default response byte-identical for existing callers (Slack bot, programmatic callers) that don't expect a `lint_findings` key — called out explicitly in the interface comment (SPEC-044 C.R4) as a deliberate backward-compatibility choice, not an oversight. Every one of meditate's five internal queries scope-filters on `project_scope = $1` — worth contrasting with `dump-edges-sidecar.ts` and `stats.ts`, which do not scope-filter at all, when reasoning about which tools in this directory respect project isolation.

# Citations
[1] BACKFILL-r2mcp-03 evidence: /Users/dustincheng/projects/claudeclaw/docs/specs/asbuilt-living-kb/evidence/backfill03-evidence.yml
