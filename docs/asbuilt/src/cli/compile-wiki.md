---
type: Module
title: src/cli/compile-wiki.ts
description: Skeleton concept for src/cli/compile-wiki.ts (extracted; 6 symbols).
resource: src/cli/compile-wiki.ts
tags:
  - src
  - module
  - function
  - interface
enrichment: accuracy-audited
from:
  - BACKFILL-r2mcp-04
explains:
  - src/cli/compile-wiki.ts#CliArgs
  - src/cli/compile-wiki.ts#gitSha
  - src/cli/compile-wiki.ts#isTier
  - src/cli/compile-wiki.ts#loadMemoriesFromDb
  - src/cli/compile-wiki.ts#main
  - src/cli/compile-wiki.ts#parseArgs
stale: false
stale_reason: ""
graph_hash: 722abd60fe9a14221204daed15ffc79c1ccb916aa2f11bc37b8d327971cb1d46
---

# Structure

## Symbols
| Symbol | Kind | Span | Exported |
|---|---|---|---|
| `CliArgs` | interface | 39-46 | no |
| `gitSha` | function | 156-163 | no |
| `isTier` | function | 50-52 | no |
| `loadMemoriesFromDb` | function | 82-154 | no |
| `main` | function | 170-225 | no |
| `parseArgs` | function | 54-80 | no |

## Calls out
- `loadMemoriesFromDb` → [currentScope](/src/env.md)
- `loadMemoriesFromDb` → [getPool](/src/db.md)
- `main` → [closeDb](/src/db.md)
- `main` → [currentScope](/src/env.md)
- `main` → [exit](/src/index.ts.md)
- `main` → `gitSha` (same file)
- `main` → [initDb](/src/db.md)
- `main` → `loadMemoriesFromDb` (same file)
- `main` → `parseArgs` (same file)
- `main` → [runCompile](/src/compiler/run.md)
- `main` → [selectProvider](/src/providers/index.ts.md)
- `main` → [withToolSpan](/src/telemetry.md)
- `main` → [RunSummaryWriter.write](/src/edges/state.md)
- `parseArgs` → [isProviderName](/src/providers/index.ts.md)
- `parseArgs` → `isTier` (same file)

# Explanation
compile-wiki.ts turns raw `memories`/`memory_edges` rows into the markdown wiki that other tools (and future Claude sessions) read from `memory/compiled/`. It is a data-loading + path-resolution shell around `runCompile` (src/compiler/run.ts), which does the actual LLM-driven synthesis; this file's job is getting the right rows, with the right edges attached, into the right output directory.

# Decisions
- (BACKFILL-r2mcp-04) The scope-to-directory mapping (`compiledDir`) special-cases `'global'` to the legacy flat `memory/compiled` path rather than always nesting under a scope subfolder — this is explicitly a backward-compatibility decision (claw-nyxd) so existing consumers that read `memory/compiled/preferences.md` directly don't break for anyone who never set `R2MCP_SCOPE`. Any OTHER scope gets sanitized (`replace(/[^a-zA-Z0-9._-]/g, '_')`) into its own subdirectory specifically so `runCompile`'s `deleteStaleFiles` step — which deletes compiled files no longer backed by any memory — can never reach outside its own scope's directory and delete another project's wiki; this is a real correctness property, not just organization, since a stale-file sweep is inherently destructive. `gitSha()` swallows every error to `null` via a bare `catch {}` around `execSync` — provenance stamping (which commit's memories produced this wiki snapshot) is a nice-to-have, and a repo without git installed, or a working tree that isn't a git repo at all (e.g. an npm-installed r2mcp with no `.git`), must still be able to compile. `main`'s own arg-presence guard (`if (!args.tier && !args.all && !args.topic) throw ...`, lines 172-174) only rejects the 'nothing selected' case — it is NOT where `--tier=x --all`-style over-specification gets caught. That is caught downstream, inside `runCompile` itself, by `src/compiler/run.ts#validateOptions`, which is called as the first line of `runCompile` and throws unless exactly one of `tier`/`all`/`topic` is truthy. A future reader adding a new mode flag to this CLI must remember `validateOptions` lives in the compiler module, not here, and needs a matching update if the set of mutually-exclusive modes changes. The edge-attachment step in `loadMemoriesFromDb` intentionally fetches edges in a SEPARATE query scoped to `ids = ANY($1)` on the already-loaded memory set, rather than joining edges into the main memory query — this keeps the query bounded to exactly the rows already selected by the tier/topic filter, so a `--tier=preferences` compile never pulls in unrelated edges from other tiers just because they happen to reference a preferences memory.

# Citations
[1] BACKFILL-r2mcp-04 evidence: /Users/dustincheng/projects/claudeclaw/docs/specs/asbuilt-living-kb/evidence/backfill04-evidence.yml
