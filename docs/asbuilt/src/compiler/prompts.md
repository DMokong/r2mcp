---
type: Module
title: src/compiler/prompts.ts
description: Skeleton concept for src/compiler/prompts.ts (extracted; 6 symbols).
resource: src/compiler/prompts.ts
tags:
  - src
  - module
  - function
enrichment: accuracy-audited
from:
  - BACKFILL-r2mcp-05
explains:
  - src/compiler/prompts.ts#describeEdges
  - src/compiler/prompts.ts#memoryListPromptFragment
  - src/compiler/prompts.ts#tierClusterUserPrompt
  - src/compiler/prompts.ts#tierSystemPrompt
  - src/compiler/prompts.ts#topicSectionUserPrompt
  - src/compiler/prompts.ts#topicSystemPrompt
stale: false
stale_reason: ""
graph_hash: 722abd60fe9a14221204daed15ffc79c1ccb916aa2f11bc37b8d327971cb1d46
---

# Structure

## Exports
- `memoryListPromptFragment` (function, lines 35-37)
- `tierClusterUserPrompt` (function, lines 39-50)
- `tierSystemPrompt` (function, lines 21-27)
- `topicSectionUserPrompt` (function, lines 52-68)
- `topicSystemPrompt` (function, lines 29-33)

## Symbols
| Symbol | Kind | Span | Exported |
|---|---|---|---|
| `describeEdges` | function | 74-91 | no |
| `memoryListPromptFragment` | function | 35-37 | yes |
| `tierClusterUserPrompt` | function | 39-50 | yes |
| `tierSystemPrompt` | function | 21-27 | yes |
| `topicSectionUserPrompt` | function | 52-68 | yes |
| `topicSystemPrompt` | function | 29-33 | yes |

## Calls out
- `tierClusterUserPrompt` → `describeEdges` (same file)
- `tierClusterUserPrompt` → `memoryListPromptFragment` (same file)
- `topicSectionUserPrompt` → `describeEdges` (same file)
- `topicSectionUserPrompt` → `memoryListPromptFragment` (same file)

## Called by
- `compileTier` in [src/compiler/tier.ts](/src/compiler/tier.md)
- `compileTier` in [src/compiler/tier.ts](/src/compiler/tier.md)
- `compileTopic` in [src/compiler/topic.ts](/src/compiler/topic.md)
- `compileTopic` in [src/compiler/topic.ts](/src/compiler/topic.md)

# Explanation
This module is the seam between "what the compiler decides the wiki should look like" and "what the LLM is allowed to contribute." It exists as a separate file specifically so prompt language can be iterated on and snapshot-tested without touching orchestration logic in tier.ts/topic.ts (stated directly in the file's top comment) — treat prompt wording changes here as changes to compile *output*, not internal logic, since the LLM's prose is the primary externally-visible product of this whole subsystem.

# Decisions
- (BACKFILL-r2mcp-05) The load-bearing design decision here is the header/citation split described at the top: the compiler inserts headers and `Sources:`/`<m:id>` citation tags itself (in tier.ts/topic.ts, not here), and both system prompts explicitly instruct the model not to produce them. This is what makes B.R5's cross-run stability guarantee possible — citations and headers derive from deterministic input data (the memory list + clustering), never from anything the model generates, so they can't drift even if the model's prose does. `topicSystemPrompt`'s magic string `NONE` is a fragile contract: if a future prompt edit rephrases the "no content" instruction without preserving the exact literal `NONE`, `compileTopic`'s `prose === 'NONE'` check in topic.ts will stop matching and empty sections will render the model's actual refusal text instead of the intended `_(no relevant content)_` placeholder — there's no fuzzy matching here. Also, `describeEdges` only surfaces `supersedes` / `contradicts` / `evolved_into` relations, silently dropping `supports` / `depends_on` / `related_to` even though `EdgeForCompile` (types.ts) defines all six — a deliberate scope decision per B.AC7 ("only relations that affect prose framing"), but a future reader adding a new edge-driven framing feature needs to extend this allowlist explicitly, not assume all edge types already flow through.

# Citations
[1] BACKFILL-r2mcp-05 evidence: /Users/dustincheng/projects/claudeclaw/docs/specs/asbuilt-living-kb/evidence/backfill05-evidence.yml
