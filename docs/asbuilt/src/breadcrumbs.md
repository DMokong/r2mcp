---
type: Module
title: src/breadcrumbs.ts
description: Skeleton concept for src/breadcrumbs.ts (extracted; 24 symbols).
resource: src/breadcrumbs.ts
tags:
  - src
  - module
  - class
  - function
  - interface
  - method
  - type
enrichment: accuracy-audited
from:
  - BACKFILL-r2mcp-01
explains:
  - src/breadcrumbs.ts#BreadcrumbContext
  - src/breadcrumbs.ts#InvalidBreadcrumbError
  - src/breadcrumbs.ts#ToolName
  - src/breadcrumbs.ts#assertBreadcrumb
  - src/breadcrumbs.ts#dispatchMapper
  - src/breadcrumbs.ts#mapExtractEntities
  - src/breadcrumbs.ts#mapLint
  - src/breadcrumbs.ts#mapRecall
  - src/breadcrumbs.ts#mapRemember
  - src/breadcrumbs.ts#withBreadcrumbs
stale: false
stale_reason: ""
graph_hash: f3062700a89bb65b1df9622f69f7f24581224e0a7462079dc9cdb4a2395643c0
---

# Structure

## Exports
- `Breadcrumb` (interface, lines 25-29)
- `BreadcrumbContext` (type, lines 38-54)
- `ExtractEntitiesArgs` (interface, lines 138-141)
- `ExtractEntitiesResponse` (interface, lines 131-136)
- `ExtractedEntitySummary` (interface, lines 125-129)
- `InvalidBreadcrumbError` (class, lines 143-150)
- `LintArgs` (interface, lines 106-108)
- `LintFinding` (interface, lines 94-99)
- `LintResponse` (interface, lines 101-104)
- `RecallArgs` (interface, lines 89-92)
- `RecallResponse` (interface, lines 81-87)
- `RecallResultItem` (interface, lines 65-68)
- `RecallSignal` (interface, lines 75-79)
- `RememberArgs` (interface, lines 120-123)
- `RememberResponse` (interface, lines 114-118)
- `ToolName` (type, lines 9-20)
- `assertBreadcrumb` (function, lines 152-163)
- `withBreadcrumbs` (function, lines 269-278)

## Symbols
| Symbol | Kind | Span | Exported |
|---|---|---|---|
| `Breadcrumb` | interface | 25-29 | yes |
| `BreadcrumbContext` | type | 38-54 | yes |
| `ExtractEntitiesArgs` | interface | 138-141 | yes |
| `ExtractEntitiesResponse` | interface | 131-136 | yes |
| `ExtractedEntitySummary` | interface | 125-129 | yes |
| `InvalidBreadcrumbError` | class | 143-150 | yes |
| `InvalidBreadcrumbError.constructor` | method | 144-149 | yes |
| `LintArgs` | interface | 106-108 | yes |
| `LintFinding` | interface | 94-99 | yes |
| `LintResponse` | interface | 101-104 | yes |
| `RecallArgs` | interface | 89-92 | yes |
| `RecallResponse` | interface | 81-87 | yes |
| `RecallResultItem` | interface | 65-68 | yes |
| `RecallSignal` | interface | 75-79 | yes |
| `RememberArgs` | interface | 120-123 | yes |
| `RememberResponse` | interface | 114-118 | yes |
| `ToolName` | type | 9-20 | yes |
| `assertBreadcrumb` | function | 152-163 | yes |
| `dispatchMapper` | function | 253-267 | no |
| `mapExtractEntities` | function | 228-251 | no |
| `mapLint` | function | 187-204 | no |
| `mapRecall` | function | 168-186 | no |
| `mapRemember` | function | 207-227 | no |
| `withBreadcrumbs` | function | 269-278 | yes |

## Calls out
- `dispatchMapper` → `mapExtractEntities` (same file)
- `dispatchMapper` → `mapLint` (same file)
- `dispatchMapper` → `mapRecall` (same file)
- `dispatchMapper` → `mapRemember` (same file)
- `withBreadcrumbs` → `assertBreadcrumb` (same file)
- `withBreadcrumbs` → `dispatchMapper` (same file)

## Called by
- `asMcpResponse` in [src/mcp-response.ts](/src/mcp-response.md)

# Explanation
This is r2mcp's "next steps" subsystem (SPEC-047 Phase 5). After any MCP tool finishes its real work, this module inspects the tool's own (response, args) pair — nothing else, no DB or LLM calls — and derives up to 3 suggested follow-up tool invocations, attached to the response as a `next_tools: [{name, usage, why}]` array. The file's own epigraph ("Tao of Mac: servers plan, models walk") captures the intent: the server does deterministic reasoning about what a reasonable next step would be, so the calling model doesn't have to guess or hallucinate a follow-up command. It's wired in exactly one place — `src/mcp-response.ts#asMcpResponse` — which every tool handler in `src/index.ts` calls before serializing its response, so breadcrumb generation happens uniformly at the response-shaping boundary rather than being reimplemented per tool.

# Decisions
- (BACKFILL-r2mcp-01) Only 4 of the 11 tools in the `ToolName` union have real breadcrumb logic — `recall`, `lint`, `remember`, `extract_entities` — the other 7 (`search`, `stats`, `meditate`, `reject`, `compile`, `classify`, `dump_edges_sidecar`) fall through `dispatchMapper`'s `default` case and always get `next_tools: []`. The file comment is explicit that this is deliberate Phase 5 scope, not an oversight, but it does mean adding breadcrumb support to e.g. `compile` later requires a new case in `dispatchMapper` AND a new `BreadcrumbContext` variant AND (per the comment above `ToolName`) remembering both when a 12th tool is ever added. `mapRecall` only turns `contradicts` signals into breadcrumbs, never `superseded_by`, and de-duplicates by `from_id` with a `Set` — so a memory with 3 separate contradiction edges still produces just one `lint --check=contradictions --memory-id=...` suggestion, not three. `mapLint`'s ranking (labeled "R6" in the comment) only counts findings where `check === 'contradictions'` AND a `topic` is present; findings without a topic are silently excluded from breadcrumb generation because there'd be no `--topic=` value to hand back to `compile`. Ties in both `mapLint` and `mapExtractEntities` break alphabetically on name/topic — a deterministic, arbitrary-but-stable choice rather than e.g. insertion order. `mapRemember` only fires when `response.id` is set, which per its comment covers ADD/UPDATE/REJECTION but deliberately skips NOOP and unresolved ARCHIVE outcomes (both leave `id` undefined) — a no-op remember produces no "go verify it" breadcrumb because there's nothing new to verify. It also truncates the echoed content to `QUERY_SNIPPET_MAX = 80` chars and collapses whitespace before embedding it in the suggested `recall --query=...` command. `mapExtractEntities` only fires when `entities_created > 0` AND `new_entities` is non-empty, and its confidence-descending / alphabetical-tiebreak ranking is explicitly labeled in-code as "Open Question 3 resolution" — i.e. a design question left open elsewhere got settled here, in the implementation, rather than by a spec amendment. `withBreadcrumbs` validates every mapper-produced candidate via `assertBreadcrumb` (throwing `InvalidBreadcrumbError` on any empty/non-string `name`/`usage`/`why`) *before* truncating to `MAX_BREADCRUMBS = 3` — so a malformed breadcrumb fails loudly at construction rather than silently shipping a broken suggestion to the calling model; truncation itself trusts whatever order the mapper already produced (ranking is each mapper's own responsibility, not `withBreadcrumbs`'s). Several comments preserve a documented historical bug (tagged "claw-sup7") as a guardrail: earlier drafts of this file assumed a nested per-result `r.signals.contradictions[]` shape on recall responses and a `memory_id` field on remember responses — neither ever existed on the real production shapes (flat top-level `signals[]`, and `id` only) — and the comments exist specifically so a future maintainer doesn't reintroduce the same wrong assumption from memory or from stale documentation. Relatedly, the structural types declared in this file (`RecallResultItem`, `RecallSignal`, `LintFinding`, etc.) are deliberately NOT imported from `src/tools/recall.ts` / `src/edges/types.ts` — the comment states this is to avoid taking on the full tool schemas as a dependency, at the cost of two definitions (here and in the real tool modules) that must be kept in sync by hand whenever the real response shapes change.

# Citations
[1] BACKFILL-r2mcp-01 evidence: /Users/dustincheng/projects/claudeclaw/.claude/worktrees/asbuilt-living-kb/docs/specs/asbuilt-living-kb/evidence/backfill-evidence.yml
