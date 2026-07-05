---
type: Module
title: src/tools/reject.ts
description: Skeleton concept for src/tools/reject.ts (extracted; 3 symbols).
resource: src/tools/reject.ts
tags:
  - src
  - module
  - function
  - interface
enrichment: accuracy-audited
from:
  - BACKFILL-r2mcp-03
explains:
  - src/tools/reject.ts#RejectInput
  - src/tools/reject.ts#RejectResult
  - src/tools/reject.ts#reject
stale: false
stale_reason: ""
graph_hash: 722abd60fe9a14221204daed15ffc79c1ccb916aa2f11bc37b8d327971cb1d46
---

# Structure

## Exports
- `RejectInput` (interface, lines 5-8)
- `RejectResult` (interface, lines 10-14)
- `reject` (function, lines 16-60)

## Symbols
| Symbol | Kind | Span | Exported |
|---|---|---|---|
| `RejectInput` | interface | 5-8 | yes |
| `RejectResult` | interface | 10-14 | yes |
| `reject` | function | 16-60 | yes |

## Calls out
- `reject` → [currentScope](/src/env.md)
- `reject` → [fingerprint](/src/fingerprint.md)
- `reject` → [getPool](/src/db.md)

## Called by
- `runClaude` in [src/providers/claude-code.ts](/src/providers/claude-code.md)

# Explanation
reject() implements "this memory was wrong, and here's the reason" — it does not delete the original memory, it flips its `type` to `'rejection'` in place (preserving history), and then inserts the rejection reason as a brand-new memory row of its own, so the reasoning becomes a first-class, stored entry rather than a fire-and-forget log line.

# Decisions
- (BACKFILL-r2mcp-03) The reason memory inherits the original's `tier`/`topics`/`people` rather than being freshly classified, keeping it co-located with what it rejects without a second embedding pass. Its `section` is set to the convention string `rejection-of:<id>` rather than a real foreign key — finding a memory's rejection reason means filtering on that string, there's no join table. Non-obvious gotcha: the reason memory's own `type` is ALSO hardcoded to `'rejection'` in the same INSERT statement — which means it is subject to the exact same `type != 'rejection'` exclusion that `search()` (search.ts) applies unconditionally. In practice this means rejection reasons are stored but not discoverable through normal `search()` calls; a future reader building a "show me why X was rejected" UI needs a different query path (raw SQL, or a dedicated lookup by `section`), not `search()`. The `UPDATE` (mark original rejected) and the `INSERT` (store the reason) are two separate statements with no explicit transaction wrapping them — a crash between the two would leave an orphaned rejected memory with no stored reason; this is at least not user-visible (the orphaned original is still excluded from search either way) but it means the reasoning silently didn't get recorded.

# Citations
[1] BACKFILL-r2mcp-03 evidence: /Users/dustincheng/projects/claudeclaw/docs/specs/asbuilt-living-kb/evidence/backfill03-evidence.yml
