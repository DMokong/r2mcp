---
type: Module
title: src/lint/checks/stale.ts
description: Skeleton concept for src/lint/checks/stale.ts (extracted; 2 symbols).
resource: src/lint/checks/stale.ts
tags:
  - src
  - module
  - function
  - interface
enrichment: accuracy-audited
from:
  - BACKFILL-r2mcp-08
explains:
  - src/lint/checks/stale.ts#StaleRow
  - src/lint/checks/stale.ts#findStale
stale: false
stale_reason: ""
graph_hash: c192643d124600fd68491305707bec2b09c19febe0921e729af00e7c9e27905f
---

# Structure

## Exports
- `findStale` (function, lines 45-61)

## Symbols
| Symbol | Kind | Span | Exported |
|---|---|---|---|
| `StaleRow` | interface | 18-22 | no |
| `findStale` | function | 45-61 | yes |

## Calls out
- `findStale` → [currentScope](/src/env.md)

## Called by
- `runLint` in [src/lint/run.ts](/src/lint/run.md)

# Explanation
Finds memories that are old (default 90+ days), have never been referenced
by anything (no incoming edges), and are not in the `preferences` tier —
preferences are treated as durable decisions rather than things expected to
accrue references, so they are exempt from staleness entirely.

# Decisions
- (BACKFILL-r2mcp-08) Staleness is judged purely by incoming edges — having outgoing edges never
protects a memory from being flagged, which is the deliberate opposite of
`orphans.ts`'s "either direction" rule. A memory that still cites older
context (has_outgoing = true) is still reported stale, just at a lower
confidence (0.7 vs 0.95 for a fully unconnected memory) — the reasoning is
that "nothing points TO me anymore" is the actual staleness signal, and
"I still point somewhere" is a softer mitigating factor, not a full
exemption. Only the 0.95 (fully unconnected) tier clears
`FIX_CONFIDENCE_THRESHOLD` — `lint --fix` will archive a stale memory only
when it is completely isolated; a stale-but-still-referencing memory always
surfaces as a finding but is never auto-archived, so a future reader
shouldn't expect `--fix` to clean up every stale finding. The preferences
exemption is load-bearing for correctness, not a performance shortcut — if a
future migration renames or removes the `preferences` tier value, this
check will silently stop exempting anything, which would be a behavior
change worth testing for explicitly.

# Citations
[1] BACKFILL-r2mcp-08 evidence: /Users/dustincheng/projects/claudeclaw/docs/specs/asbuilt-living-kb/evidence/backfill08-evidence.yml
