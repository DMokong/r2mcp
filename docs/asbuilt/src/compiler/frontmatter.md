---
type: Module
title: src/compiler/frontmatter.ts
description: Skeleton concept for src/compiler/frontmatter.ts (extracted; 8 symbols).
resource: src/compiler/frontmatter.ts
tags:
  - src
  - module
  - function
enrichment: accuracy-audited
from:
  - BACKFILL-r2mcp-05
explains:
  - src/compiler/frontmatter.ts#emitFrontmatter
  - src/compiler/frontmatter.ts#extractHeaders
  - src/compiler/frontmatter.ts#levenshtein
  - src/compiler/frontmatter.ts#levenshteinRatio
  - src/compiler/frontmatter.ts#parseFrontmatter
  - src/compiler/frontmatter.ts#quote
  - src/compiler/frontmatter.ts#stripForBodyComparison
  - src/compiler/frontmatter.ts#unquote
stale: false
stale_reason: ""
graph_hash: 722abd60fe9a14221204daed15ffc79c1ccb916aa2f11bc37b8d327971cb1d46
---

# Structure

## Exports
- `emitFrontmatter` (function, lines 14-33)
- `extractHeaders` (function, lines 102-109)
- `levenshteinRatio` (function, lines 140-145)
- `parseFrontmatter` (function, lines 40-85)
- `stripForBodyComparison` (function, lines 116-134)

## Symbols
| Symbol | Kind | Span | Exported |
|---|---|---|---|
| `emitFrontmatter` | function | 14-33 | yes |
| `extractHeaders` | function | 102-109 | yes |
| `levenshtein` | function | 147-163 | no |
| `levenshteinRatio` | function | 140-145 | yes |
| `parseFrontmatter` | function | 40-85 | yes |
| `quote` | function | 87-89 | no |
| `stripForBodyComparison` | function | 116-134 | yes |
| `unquote` | function | 91-96 | no |

## Calls out
- `emitFrontmatter` → `quote` (same file)
- `levenshteinRatio` → `levenshtein` (same file)
- `parseFrontmatter` → `unquote` (same file)

## Called by
- `runCompile` in [src/compiler/run.ts](/src/compiler/run.md)

# Explanation
This module owns the entire text-level contract between compiled wiki files and everything that reads them back (the stability-check logic elsewhere in the compile pipeline, and any future tooling that diffs compiled output). It was deliberately written dependency-free instead of pulling in `js-yaml`: per the file's top comment, the frontmatter schema the compiler emits is narrow enough (strings, numbers, nulls, and one array of strings) that a full YAML library would be overkill, and hand-rolling it means `emitFrontmatter`/ `parseFrontmatter` are exact inverses of each other by construction — a general-purpose YAML parser might legally re-interpret escaping differently and silently break round-tripping.

# Decisions
- (BACKFILL-r2mcp-05) Key gotchas: (1) `parseFrontmatter` is deliberately strict — it throws rather than degrading gracefully if the file doesn't open with `---\n` or the block never closes. Anything that reads a compiled file back will hard-fail on a hand-edited or corrupted compiled file rather than skip it; don't assume this parser is forgiving if you're building a tool that consumes `memory/compiled/*.md`. (2) The parser only understands the exact keys `emitFrontmatter` writes — adding a new field to `CompileFrontmatter` (types.ts) requires updating BOTH functions by hand; there's no schema-driven round-trip, so it's easy to add a field to the emitter and forget the parser (or vice versa) and only notice when something downstream silently gets `undefined`. (3) `stripForBodyComparison` + `levenshteinRatio` exist purely to support a stability check elsewhere that bounds how much the LLM's prose is allowed to drift between two compile runs of the same input — the citation-tag regexes (`<m:id>` / `[m:id]`) it strips must stay in sync with whatever format `tier.ts`/`topic.ts` actually emit citations in; if that citation format ever changes, this stripping regex needs a matching update or the Levenshtein comparison will start scoring citation-tag noise as prose variance.

# Citations
[1] BACKFILL-r2mcp-05 evidence: /Users/dustincheng/projects/claudeclaw/docs/specs/asbuilt-living-kb/evidence/backfill05-evidence.yml
