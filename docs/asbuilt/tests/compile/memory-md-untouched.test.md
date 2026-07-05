---
type: Module
title: tests/compile/memory-md-untouched.test.ts
description: Skeleton concept for tests/compile/memory-md-untouched.test.ts
  (extracted; 4 symbols).
resource: tests/compile/memory-md-untouched.test.ts
tags:
  - tests
  - module
  - function
enrichment: accuracy-audited
from:
  - BACKFILL-r2mcp-12
explains:
  - tests/compile/memory-md-untouched.test.ts#baseOpts
  - tests/compile/memory-md-untouched.test.ts#mem
  - tests/compile/memory-md-untouched.test.ts#provider
  - tests/compile/memory-md-untouched.test.ts#sha256
stale: false
stale_reason: ""
graph_hash: 722abd60fe9a14221204daed15ffc79c1ccb916aa2f11bc37b8d327971cb1d46
---

# Structure

## Symbols
| Symbol | Kind | Span | Exported |
|---|---|---|---|
| `baseOpts` | function | 69-78 | no |
| `mem` | function | 65-67 | no |
| `provider` | function | 53-63 | no |
| `sha256` | function | 49-51 | no |

# Explanation
This suite is the mechanical proof of spec clause B.AC5 — `compile()` must never modify the human-curated `memory/MEMORY.md` hub, only ever write under `<projectRoot>/memory/compiled/`. It exists because MEMORY.md is explicitly documented elsewhere (the host project's memory-architecture table) as a manually-curated, never-regenerable file, and compile silently touching it would be a data-loss-class bug, not a cosmetic one.

# Decisions
- (BACKFILL-r2mcp-12) Unlike every other compile test file, this one deliberately uses the REAL filesystem (a mkdtempSync scaffold) instead of the mocked CompileFs seam — the file's own doc comment states a pure-mock test "wouldn't be load-bearing," because the property under test (does runCompile's real path-joining logic ever wander outside compiledDir?) can only be falsified by exercising the actual resolve()/writeFile() calls, not a mock that trivially can't touch the wrong path. The suite checks both content hash (SHA-256) AND mtime unchanged — the mtime check catches a hypothetical "read MEMORY.md then write back the identical bytes" bug that a content-only hash comparison would miss. It additionally proves a pre-existing legacy `memory/preferences.md` (a file NOT under compiled/, left from before the dual-write transition) is untouched even when that same-named tier is compiled — guarding the specific migration-era hazard of legacy tier files and newly compiled tier files colliding.

# Citations
[1] BACKFILL-r2mcp-12 evidence: /Users/dustincheng/projects/claudeclaw/docs/specs/asbuilt-living-kb/evidence/backfill12-evidence.yml
