---
type: Module
title: tests/scope-isolation.test.ts
description: Skeleton concept for tests/scope-isolation.test.ts (extracted; 2 symbols).
resource: tests/scope-isolation.test.ts
tags:
  - tests
  - module
  - function
enrichment: accuracy-audited
from:
  - BACKFILL-r2mcp-11
explains:
  - tests/scope-isolation.test.ts#addIn
  - tests/scope-isolation.test.ts#withScope
stale: false
stale_reason: ""
graph_hash: 722abd60fe9a14221204daed15ffc79c1ccb916aa2f11bc37b8d327971cb1d46
---

# Structure

## Symbols
| Symbol | Kind | Span | Exported |
|---|---|---|---|
| `addIn` | function | 39-45 | no |
| `withScope` | function | 34-37 | no |

## Calls out
- `addIn` → [remember](/src/tools/remember.md)

# Explanation
This is the authoritative proof that ClaudeClaw's multi-tenant project scoping (claw-nyxd) actually isolates data, run against a real database. A future reader adding any new read or destructive tool to the memory system should add a corresponding guarantee here before shipping it — the five-plus-two guarantee structure (G1-G5, G5b, P0a) is meant to be the checklist, not just historical documentation of what was checked once.

# Decisions
- (BACKFILL-r2mcp-11) withScope() sets process.env.R2MCP_SCOPE and calls the callback but does NOT restore the previous value afterward inline — restoration only happens in the file-level afterEach. This is a deliberate simplification (most tests only ever set one scope), but it means a test that calls withScope() twice with different scopes in sequence will have the second scope "stick" for anything running after it within the same test body, until the next withScope() call or the afterEach — a future reader writing a test that alternates scopes mid-test needs to be aware of this rather than assuming automatic reset. G2's test deliberately uses a single shared keyword ("widget") across both a global and a project-scoped memory rather than a natural multi-word sentence, because plainto_tsquery ANDs terms in a multi-word query — a more naturally worded test could accidentally require term co-occurrence and produce a false negative for the isolation property actually being tested. P0a's recall({scope: 'ai-landscape'}) guarantee is tied directly to the LLM-Wiki producer/reader architecture: one process can read a specific other project's compiled wiki corpus (plus global) without changing its own ambient scope or restarting — this is the guarantee that makes that cross-project read pattern safe to rely on elsewhere in the system.

# Citations
[1] BACKFILL-r2mcp-11 evidence: /Users/dustincheng/projects/claudeclaw/docs/specs/asbuilt-living-kb/evidence/backfill11-evidence.yml
