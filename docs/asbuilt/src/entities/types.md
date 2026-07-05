---
type: Module
title: src/entities/types.ts
description: Skeleton concept for src/entities/types.ts (extracted; 8 symbols).
resource: src/entities/types.ts
tags:
  - src
  - module
  - interface
  - type
enrichment: accuracy-audited
from:
  - BACKFILL-r2mcp-07
explains:
  - src/entities/types.ts#EntityRow
  - src/entities/types.ts#EntityType
  - src/entities/types.ts#ExtractionMatched
  - src/entities/types.ts#ExtractionNewEntity
  - src/entities/types.ts#ExtractionResponse
  - src/entities/types.ts#MemoryEntityLink
  - src/entities/types.ts#RunSummary
  - src/entities/types.ts#StateRecord
stale: false
stale_reason: ""
graph_hash: 722abd60fe9a14221204daed15ffc79c1ccb916aa2f11bc37b8d327971cb1d46
---

# Structure

## Exports
- `EntityRow` (interface, lines 9-18)
- `EntityType` (type, lines 1-1)
- `ExtractionMatched` (interface, lines 27-30)
- `ExtractionNewEntity` (interface, lines 31-36)
- `ExtractionResponse` (interface, lines 37-40)
- `MemoryEntityLink` (interface, lines 20-25)
- `RunSummary` (interface, lines 42-64)
- `StateRecord` (interface, lines 66-72)

## Symbols
| Symbol | Kind | Span | Exported |
|---|---|---|---|
| `EntityRow` | interface | 9-18 | yes |
| `EntityType` | type | 1-1 | yes |
| `ExtractionMatched` | interface | 27-30 | yes |
| `ExtractionNewEntity` | interface | 31-36 | yes |
| `ExtractionResponse` | interface | 37-40 | yes |
| `MemoryEntityLink` | interface | 20-25 | yes |
| `RunSummary` | interface | 42-64 | yes |
| `StateRecord` | interface | 66-72 | yes |

# Explanation
types.ts has no logic of its own — it is the shared vocabulary that lets extractor.ts, prompt.ts, state.ts, db.ts, and the extract_entities MCP tool handler (src/tools/extract-entities.ts) all agree on the shape of an entity, an extraction result, a state-log row, and a run summary without each file redeclaring its own version. A future reader should treat every field's comment here as load-bearing documentation of a decision made elsewhere, not incidental notes.

# Decisions
- (BACKFILL-r2mcp-07) EntityType (a compile-time string-literal union) is deliberately paired with a runtime `ENTITY_TYPES` const array declared immediately below it in the same file — the standard TypeScript idiom for getting a runtime-checkable enumeration out of a type that otherwise erases at compile time; prompt.ts relies on this exact array (`ENTITY_TYPES.includes(n.type)`) to reject LLM-hallucinated entity types that aren't one of the four allowed values. If a fifth entity type is ever added, both the type union AND the array must be updated together (they are two separate exported symbols textually adjacent, not derived from each other). RunSummary.error is intentionally overloaded to represent two different failure classes with the same string field — a caught provider exception's message (set by extractor.ts's early-return path) OR a synthesized `parse failures: N` summary (set by `finalize()` only when no other error is already present) — so a consumer of this type cannot distinguish 'the whole run aborted due to a provider outage' from 'the run completed but had some unparseable responses' by checking `error` alone; it would need to also check whether `memories_seen` reached the expected candidate count, or inspect `parse_failures` directly. `hallucinated_matched` was added to this interface after the fact (per its inline comment, claw-2jbo PR #1 finding 2) purely as an observability counter — it has no effect on control flow anywhere, it exists so an operator watching run summaries over time can notice if the rate climbs, which would indicate the LLM is drifting away from staying within the known-entities context it's given. StateRecord.raw's '2KB, only for parse_failed' contract is documented here in a comment but actually enforced by a separate constant (RAW_TRUNC) in state.ts — the two files must be kept in sync by hand if that truncation length ever changes, since nothing type-checks the comment against the constant.

# Citations
[1] BACKFILL-r2mcp-07 evidence: /Users/dustincheng/projects/claudeclaw/docs/specs/asbuilt-living-kb/evidence/backfill07-evidence.yml
