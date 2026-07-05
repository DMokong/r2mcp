---
type: Module
title: src/lint/types.ts
description: Skeleton concept for src/lint/types.ts (extracted; 6 symbols).
resource: src/lint/types.ts
tags:
  - src
  - module
  - interface
  - type
enrichment: accuracy-audited
from:
  - BACKFILL-r2mcp-08
explains:
  - src/lint/types.ts#CheckName
  - src/lint/types.ts#LintFinding
  - src/lint/types.ts#LintInput
  - src/lint/types.ts#LintResult
  - src/lint/types.ts#LintSummary
  - src/lint/types.ts#SuggestedAction
stale: false
stale_reason: ""
graph_hash: 722abd60fe9a14221204daed15ffc79c1ccb916aa2f11bc37b8d327971cb1d46
---

# Structure

## Exports
- `CheckName` (type, lines 7-7)
- `LintFinding` (interface, lines 22-38)
- `LintInput` (interface, lines 45-60)
- `LintResult` (interface, lines 62-67)
- `LintSummary` (interface, lines 40-43)
- `SuggestedAction` (type, lines 14-20)

## Symbols
| Symbol | Kind | Span | Exported |
|---|---|---|---|
| `CheckName` | type | 7-7 | yes |
| `LintFinding` | interface | 22-38 | yes |
| `LintInput` | interface | 45-60 | yes |
| `LintResult` | interface | 62-67 | yes |
| `LintSummary` | interface | 40-43 | yes |
| `SuggestedAction` | type | 14-20 | yes |

# Explanation
The type contract shared by every module in `src/lint/`. Nothing here has
logic; it exists so the orchestrator and all five check modules agree on one
vocabulary for findings, actions, and request/response shapes, and so
external callers (the CLI, the MCP tool, meditate) can consume `LintResult`
without depending on any individual check's internals.

# Decisions
- (BACKFILL-r2mcp-08) `SuggestedAction` is one flat union spanning all five checks rather than five
separate per-check unions — the source comment says this trades static safety
(nothing stops `findStale` from theoretically returning `'reclassify'`) for a
single switch-able vocabulary all consumers can route on without string
matching. The contract that each check only uses "the subset that fits its
domain" is enforced by convention and tests, not the type system — a future
reviewer should not expect the compiler to catch a check returning the wrong
action for its domain. Two fields were added later for SPEC-047's
recall↔compile breadcrumbs and are asymmetric on purpose: `LintFinding.topic`
is populated only by `contradictions` (others leave it `undefined`, which is
normal, not a bug), and `LintInput.memory_id` is honored only by the
`contradictions` check's SQL filter — the type system doesn't stop a caller
from passing `memory_id` while requesting `--check=stale`, it would simply be
silently ignored. Two behaviorally critical values — `ALL_CHECKS` (the
default check list) and `FIX_CONFIDENCE_THRESHOLD = 0.9` (the confidence gate
`run.ts#applyFixes` checks first, before its own if/else dispatch chain) —
live in this file as plain consts and are NOT separately represented as graph
nodes in the asbuilt manifest (only interfaces/types/functions were
extracted); a future reader trying to find "where does 0.9 come from" via the
graph alone will not find it and must open this file directly.

# Citations
[1] BACKFILL-r2mcp-08 evidence: /Users/dustincheng/projects/claudeclaw/docs/specs/asbuilt-living-kb/evidence/backfill08-evidence.yml
