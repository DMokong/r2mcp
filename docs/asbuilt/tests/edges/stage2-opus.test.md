---
type: Module
title: tests/edges/stage2-opus.test.ts
description: Skeleton concept for tests/edges/stage2-opus.test.ts (extracted; 1 symbols).
resource: tests/edges/stage2-opus.test.ts
tags:
  - tests
  - module
  - function
enrichment: accuracy-audited
from:
  - BACKFILL-r2mcp-12
explains:
  - tests/edges/stage2-opus.test.ts#makeMockProvider
stale: false
stale_reason: ""
graph_hash: 722abd60fe9a14221204daed15ffc79c1ccb916aa2f11bc37b8d327971cb1d46
---

# Structure

## Symbols
| Symbol | Kind | Span | Exported |
|---|---|---|---|
| `makeMockProvider` | function | 9-21 | no |

# Explanation
This suite is the safety net for AC10 — the rule that a type=rejection memory ("don't do X") is a meta-statement about avoidance, not a factual claim, and therefore can never be the source of a `contradicts` edge. It also pins the strict JSON parsing and closed relation vocabulary for Stage 2 (Opus) classification output.

# Decisions
- (BACKFILL-r2mcp-12) AC10 is enforced in two independent layers, and this suite tests both: the system prompt tells the LLM not to use "contradicts" for rejection pairs (soft enforcement, not directly testable in isolation), AND `stage2OpusClassify` post-processes the parsed result and downgrades contradicts to none if `isRejectionPair` is true regardless of what the LLM said (hard enforcement, tested directly in the "downgrades contradicts to none... AC10 guard" case). The downgrade path deliberately preserves the LLM's original rationale text inside the rewritten rationale (prefixed "[AC10] downgraded contradicts->none...; original rationale: ...") rather than discarding it, so a human auditing edges later can see what the LLM actually argued even though the system overrode it. `parseStage2Response`'s relation whitelist throwing on an unrecognized string (e.g. "bogus") exists because Opus occasionally free-associates a plausible-sounding but unlisted relation name; treating that as a hard parse failure — rather than silently coercing it to "related_to" or "none" — keeps bad data out of the memory_edges table entirely rather than writing a wrong-but-plausible edge.

# Citations
[1] BACKFILL-r2mcp-12 evidence: /Users/dustincheng/projects/claudeclaw/docs/specs/asbuilt-living-kb/evidence/backfill12-evidence.yml
