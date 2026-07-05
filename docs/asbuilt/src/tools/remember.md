---
type: Module
title: src/tools/remember.ts
description: Skeleton concept for src/tools/remember.ts (extracted; 7 symbols).
resource: src/tools/remember.ts
tags:
  - src
  - module
  - function
  - interface
  - type
enrichment: accuracy-audited
from:
  - BACKFILL-r2mcp-02
explains:
  - src/tools/remember.ts#RememberInput
  - src/tools/remember.ts#RememberResult
  - src/tools/remember.ts#remember
stale: false
stale_reason: ""
graph_hash: 722abd60fe9a14221204daed15ffc79c1ccb916aa2f11bc37b8d327971cb1d46
---

# Structure

## Exports
- `MemoryMetadata` (interface, lines 20-26)
- `MemoryType` (type, lines 12-18)
- `Operation` (type, lines 10-10)
- `RememberInput` (interface, lines 28-34)
- `RememberResult` (interface, lines 36-43)
- `Tier` (type, lines 11-11)
- `remember` (function, lines 45-225)

## Symbols
| Symbol | Kind | Span | Exported |
|---|---|---|---|
| `MemoryMetadata` | interface | 20-26 | yes |
| `MemoryType` | type | 12-18 | yes |
| `Operation` | type | 10-10 | yes |
| `RememberInput` | interface | 28-34 | yes |
| `RememberResult` | interface | 36-43 | yes |
| `Tier` | type | 11-11 | yes |
| `remember` | function | 45-225 | yes |

## Calls out
- `remember` → [currentScope](/src/env.md)
- `remember` → [embedText](/src/embeddings.md)
- `remember` → [embeddingWarning](/src/embeddings.md)
- `remember` → [fingerprint](/src/fingerprint.md)
- `remember` → [getPool](/src/db.md)
- `remember` → [triggerGraphRebuild](/src/graph-rebuild.md)

## Called by
- `migrate` in [src/cli/migrate.ts](/src/cli/migrate.md)
- `insertBackdated` in [tests/gauntlet.test.ts](/tests/gauntlet.test.md)
- `addIn` in [tests/scope-isolation.test.ts](/tests/scope-isolation.test.md)

# Explanation
remember.ts implements the full write-path business logic behind the `remember` MCP tool — the four real operations (ADD, UPDATE, ARCHIVE, REJECTION) plus an explicit NOOP contract so a caller (typically an LLM deciding whether content is worth persisting) can say "do nothing" without a caller-side special case. It is the only place fingerprinting, deduplication, embedding generation, and the fire-and-forget graph-rebuild trigger are wired together for memory writes.

# Decisions
- (BACKFILL-r2mcp-02) Dedup keys on fingerprint AND `project_scope`, not fingerprint alone (claw-nyxd) — the same insight (e.g. "emojis welcome") can legitimately exist as an independent row in two different projects' scopes, and a global fingerprint-uniqueness check would have merged them, making per-project archival/rejection cross-contaminate. REJECTION reuses the exact ADD code path (same fingerprint check, same embedding call, same insert) except `type` is hardcoded to `'rejection'` regardless of what the caller passed in `metadata.type`, guaranteeing a rejection is always filterable as `type='rejection'` even with a stale or wrong caller-supplied type. ARCHIVE never deletes a row — it flips `type` to `'archived'` in place for reversibility, and if the caller also supplies non-empty `content`, ARCHIVE additionally inserts that as a brand-new row in the SAME call, an intentional "archive-and-replace" convenience so correcting a belief doesn't need two round trips. Every mutating branch spreads a `warnings` key into the response ONLY when there is a warning (`...(warning ? {warnings:[warning]} : {})`) rather than always including a null/empty field — consistent with the project-wide token-cost-consciousness also documented in mcp-response.ts. `triggerGraphRebuild(projectRoot)` is fired without being awaited or its result checked (see graph-rebuild.ts: `execFile` with a 30s timeout, errors just logged) — a future reader should not expect `remember()`'s return to reflect an already-rebuilt graph.

# Citations
[1] BACKFILL-r2mcp-02 evidence: /Users/dustincheng/projects/claudeclaw/docs/specs/asbuilt-living-kb/evidence/backfill02-evidence.yml
