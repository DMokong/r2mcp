---
type: Module
title: src/tools/spawn-cli.ts
description: Skeleton concept for src/tools/spawn-cli.ts (extracted; 4 symbols).
resource: src/tools/spawn-cli.ts
tags:
  - src
  - module
  - function
  - interface
  - type
enrichment: accuracy-audited
from:
  - BACKFILL-r2mcp-03
explains:
  - src/tools/spawn-cli.ts#CliScriptName
  - src/tools/spawn-cli.ts#ResolvedCli
  - src/tools/spawn-cli.ts#resolveCliCommand
  - src/tools/spawn-cli.ts#resolveCliCommandForUrl
stale: false
stale_reason: ""
graph_hash: 722abd60fe9a14221204daed15ffc79c1ccb916aa2f11bc37b8d327971cb1d46
---

# Structure

## Exports
- `CliScriptName` (type, lines 16-20)
- `ResolvedCli` (interface, lines 22-25)
- `resolveCliCommand` (function, lines 31-33)
- `resolveCliCommandForUrl` (function, lines 38-58)

## Symbols
| Symbol | Kind | Span | Exported |
|---|---|---|---|
| `CliScriptName` | type | 16-20 | yes |
| `ResolvedCli` | interface | 22-25 | yes |
| `resolveCliCommand` | function | 31-33 | yes |
| `resolveCliCommandForUrl` | function | 38-58 | yes |

## Calls out
- `resolveCliCommand` → `resolveCliCommandForUrl` (same file)

## Called by
- `classify` in [src/tools/classify.ts](/src/tools/classify.md)
- `compile` in [src/tools/compile.ts](/src/tools/compile.md)
- `extractEntitiesTool` in [src/tools/extract-entities.ts](/src/tools/extract-entities.md)

# Explanation
This module is the single shared answer, used by classify.ts/compile.ts/extract-entities.ts, to "how does a tool handler locate and invoke its sibling subprocess CLI driver" — it exists to solve SPEC-045's dev/prod duality where r2mcp runs via `tsx` directly against `.ts` sources in dev but via compiled `dist/*.js` + plain `node` in prod, without every tool handler having to re-solve that problem.

# Decisions
- (BACKFILL-r2mcp-03) Detection is deliberately cheap: it checks whether the *module's own* `import.meta.url` ends in `.ts` vs `.js`, relying on the fact that tsx/tsc never rewrite that URL — a reliable proxy for "is this whole process running in dev or prod." The header comment explicitly flags the one thing that would break this: if r2mcp ever adopts esbuild-style single-file bundling where dev and prod both produce `.js`, this heuristic stops working and needs replacing (a `NODE_ENV` check or a `dist/`-substring check are the suggested fallbacks) — don't assume this detection is future-proof against build-tooling changes without checking the build setup first. `resolveCliCommandForUrl` is factored out as a pure function taking an injected URL purely for testability, since `import.meta.url`-dependent logic can't otherwise be unit tested without mocking module resolution. `CliScriptName`'s closed union includes `dump-edges-json` even though no MCP tool handler ever calls `resolveCliCommand('dump-edges-json')` — dump-edges-sidecar.ts never spawns a subprocess — because the standalone `dump-edges-json` CLI script still needs the same dev/prod resolution for its own command-line invocation.

# Citations
[1] BACKFILL-r2mcp-03 evidence: /Users/dustincheng/projects/claudeclaw/docs/specs/asbuilt-living-kb/evidence/backfill03-evidence.yml
