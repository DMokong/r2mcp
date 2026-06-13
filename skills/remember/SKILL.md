---
name: remember
description: >-
  This skill should be used when the user says "/remember", "/remember <statement>",
  "remember this", "save this to memory", "don't forget", "note this down",
  "keep in mind", "always do X", "never do Y", "that's wrong", "don't do it
  that way", "I told you not to", "stop doing X", or any variation of asking to
  persist information across sessions. Handles classification into the 3-tier
  memory system with explicit operations (ADD/UPDATE/ARCHIVE/REJECTION/NOOP),
  write-time metadata, and cross-references. Also invoked silently
  by the SessionEnd hook to scan for unsaved memories.
---

# Remember — Memory Discipline Skill

Write memories to the 3-tier long memory system with judgment, deduplication, and conflict resolution. This skill is the single source of truth for what's worth remembering and how to file it.

## MCP Mode Detection

Before executing any memory write, check whether the Memory MCP Server is available:

**Detection:** If the MCP tool `mcp__memory__remember` is available in your tool list, use **MCP Mode**. Otherwise, use **Direct Mode** (the original file-based fallback described throughout this document).

The judgment pipeline (classification, conflict-check, operation selection, metadata generation) runs **client-side in both modes** — that is the core design. Only the storage layer differs:

### MCP Mode (preferred)

When `mcp__memory__remember` is available, replace all Edit/Write tool calls to memory tier files with a single MCP tool call:

```
mcp__memory__remember({
  operation: "ADD" | "UPDATE" | "ARCHIVE" | "REJECTION" | "NOOP",
  tier: "preferences" | "project-context" | "conversations",
  content: "The memory entry text (without the HTML metadata comment)",
  metadata: {
    type: "preference" | "decision" | "context" | "relationship" | "observation" | "rejection",
    topics: ["topic1", "topic2"],
    people: ["name1"],          // optional
    section: "Section Heading", // optional — nearest markdown heading
    date: "YYYY-MM-DD"          // optional
  },
  target_id: "uuid"  // required for UPDATE and ARCHIVE operations
})
```

**Key differences in MCP Mode:**
- Do NOT use Edit/Write tools to modify `preferences.md`, `project-context.md`, or `conversations.md`
- Do NOT run any local graph-rebuild script — the MCP server handles graph rebuilds automatically
- Do NOT write HTML metadata comments (`<!-- type:... -->`) into the content — pass metadata as structured fields instead
- Cross-references are handled by the MCP server's embedding index — no need to add `[see also: ...]` annotations manually
- For UPDATE/ARCHIVE: use `mcp__memory__search` or `mcp__memory__recall` to find the `target_id` of the entry to modify
- The `content` field should be the clean entry text only (e.g., "Always use bun instead of npm")

**For conflict-checking in MCP Mode:** Use `mcp__memory__recall` to search for existing entries on the same topic before deciding the operation (ADD vs UPDATE vs ARCHIVE). This replaces the "Read the target tier file" step in Direct Mode.

### Direct Mode (fallback)

When the MCP server is NOT available, use the original behavior described in the rest of this document: read tier files with the Read tool, write with Edit/Write tools, add HTML metadata comments, manage cross-references manually, and run the graph rebuild script.

## Two Modes

### Mode 1: With Arguments

When invoked as `/remember <statement>` (e.g., `/remember always use bun instead of npm`):

1. Classify the statement against the 3-tier system below
2. Read the target tier file
3. Check for existing related entries — decide operation (ADD, UPDATE, ARCHIVE, or NOOP)
4. Execute the operation — write the entry with metadata per the Entry Format section
5. Output a brief summary with operation type: e.g., "ADD to preferences.md <!-- type:preference topics:tooling -->"

### Mode 2: Conversation Scan (No Arguments)

When invoked as `/remember` with no arguments, or triggered by the SessionEnd hook:

1. Scan the full conversation for anything worth saving, including **correction patterns** (user saying "no", "don't", "actually...", redirecting approach). Apply the structural test from the REJECTION operation to any corrections found.
2. Apply the skip criteria — discard anything that doesn't pass
3. For each finding: classify tier, read target file, decide operation (ADD/UPDATE/ARCHIVE/NOOP), execute with metadata
4. Output a brief summary: e.g., "Saved 2 memories (1 preference, 1 project context)"
5. If nothing worth saving is found, output: "Nothing new to save."

**When invoked from a SessionEnd hook context:** Operate silently — no user-facing output. Perform all the same judgment and writes, but produce no summary text.

## 3-Tier Classification

### Tier 1 — Preferences & Decisions → `preferences.md`

Durable choices that shape how the assistant works with the user.

- "Always/never do X" statements
- Tool or workflow choices (e.g., "use bun instead of npm")
- Communication preferences (e.g., "emojis are welcome")
- Decisions with rationale (e.g., "chose Approach A because...")
- Working style preferences (e.g., "prefers short PRs")

### Tier 2 — Project Context → `project-context.md`

Facts about what exists, what's been built, and system state.

- New things built or deployed
- Architecture decisions and their rationale
- System state changes (new integrations, config changes, migrations)
- What's currently in progress or planned
- Key file paths and their purposes

### Tier 3 — Relationship Continuity → `conversations.md`

Context that makes the next session feel continuous, not cold.

- Running threads or recurring topics
- Things mentioned in passing that might matter later
- Shared vocabulary, jokes, or references
- Relationship dynamics and communication patterns
- Context that would be lost between sessions

### MEMORY.md — Active Work Threads Only

Update `MEMORY.md` only when there's a change to the **Active Work Threads** section — new threads starting, existing threads completing, or status changes. Do not duplicate tier file content here. Keep MEMORY.md under 200 lines total.

## Skip Criteria

Do NOT save:

- **Session-specific debugging** — temporary errors, stack traces, one-off fixes
- **Temporary state** — "I'm currently in directory X", "this file is open"
- **One-off commands** — commands run for a specific task with no recurring value
- **Already captured in codebase** — information already in committed docs, CLAUDE.md, or design docs
- **Speculative/unverified** — conclusions from reading a single file, guesses about architecture
- **Trivial context** — things obvious from the codebase or project structure

## Entry Format — Write-Time Metadata

Every new memory entry MUST include inline metadata as an HTML comment at the end of the bullet point:

```
- Memory content here <!-- type:TYPE topics:TOPIC1,TOPIC2 people:NAME1 -->
```

### Metadata Fields

| Field | Required | Values | Example |
|-------|----------|--------|---------|
| `type` | Yes | `preference`, `decision`, `context`, `relationship`, `observation`, `rejection` | `type:preference` |
| `topics` | Yes | 1-3 lowercase, hyphenated tags | `topics:tooling,package-management` |
| `people` | No | Lowercase names, comma-separated | `people:alex` |

### Type Classification Guide

| Type | When to Use | Example |
|------|-------------|---------|
| `preference` | "Always/never do X", tool choices, style preferences | "Use bun instead of npm" |
| `decision` | Choices with rationale, approach selections | "Chose Approach A because..." |
| `context` | Facts about what exists, system state, what's built | "CI pipeline deployed" |
| `relationship` | Running threads, shared vocabulary, personal context | "User out of office next week" |
| `observation` | Things mentioned in passing, future ideas, loose ends | "Mentioned wanting a staging environment" |
| `rejection` | Corrections, "don't do X" patterns, rejected approaches with reasoning | "Don't add verbose error handling for internal functions" |

### Examples

```markdown
- Always use bun instead of npm <!-- type:preference topics:tooling,package-management -->
- Chose tiered files over lifecycle metadata — simpler at current scale <!-- type:decision topics:memory-system,architecture -->
- CI pipeline deployed and running on GitHub Actions <!-- type:context topics:ci,deployment -->
- User out of office the week of 2026-03-02 <!-- type:relationship topics:scheduling people:alex -->
- Mentioned wanting a dedicated staging environment <!-- type:observation topics:infrastructure people:alex -->
- Don't add verbose error handling for internal functions — trust framework guarantees, only validate at system boundaries <!-- type:rejection topics:code-style,error-handling -->
```

### Backward Compatibility

Existing untagged entries (plain bullet points without `<!-- ... -->`) are valid. Do NOT retroactively tag old entries. When reading files, handle both tagged and untagged entries gracefully. Only new entries get metadata.

### MEMORY.md Exception

Do NOT add metadata to MEMORY.md entries. MEMORY.md is a hub file for active work threads — it stays lean and human-readable without metadata tags.

## Memory File Paths

All memory files live in the auto-memory directory for your project (Claude Code creates this automatically):

```
~/.claude/projects/<your-project-hash>/memory/
├── MEMORY.md           # Hub file — active work threads only
├── preferences.md      # Tier 1 — preferences & decisions
├── project-context.md  # Tier 2 — project context
├── conversations.md    # Tier 3 — relationship continuity
└── archive/            # Cold storage (quarterly)
```

The exact path depends on your project's working directory. Claude Code sets it automatically — you can find it by running `claude --print-config` or looking in `~/.claude/projects/`.

Full paths (example — your path will differ):
- **Tier 1:** `~/.claude/projects/<project-hash>/memory/preferences.md`
- **Tier 2:** `~/.claude/projects/<project-hash>/memory/project-context.md`
- **Tier 3:** `~/.claude/projects/<project-hash>/memory/conversations.md`
- **Hub:** `~/.claude/projects/<project-hash>/memory/MEMORY.md`

## Operations — Explicit Decision Framework

For every memory candidate, choose exactly ONE operation before acting. Log the operation in the output summary.

### ADD — New information, no conflicts
**When:** No existing entry covers this topic. This is genuinely new information.
**Action:** Append a new bullet point with metadata to the target tier file.
**Example:** First time the user mentions a tool preference → ADD to preferences.md

### UPDATE — Refine or extend an existing entry
**When:** An existing entry covers the same topic but has evolved, gained nuance, or needs minor correction. The core fact is still true — it just needs updating.
**Action:** Edit the existing entry in-place. Preserve the original meaning where it still holds; extend or refine where it has evolved. Update metadata tags if needed.
**Example:** "Prefers short PRs" → "Prefers short PRs, ideally under 200 lines"

### ARCHIVE — Old fact is no longer true, replace it
**When:** An existing entry directly contradicts newer information. The old fact is superseded — not just refined, but wrong or outdated.
**Action:**
1. Move the old entry to `archive/YYYY-QN.md` (create the file/directory if needed)
2. Add a supersession link to the archived entry: `[superseded: YYYY-MM-DD, see FILE#SECTION]`
3. Write the new replacement entry (with metadata) to the active tier file
**Example:** "Use npm" is contradicted by "Use bun" → ARCHIVE old entry, ADD new one

**Archive file naming:** `archive/2026-Q1.md` (quarterly: Q1=Jan-Mar, Q2=Apr-Jun, Q3=Jul-Sep, Q4=Oct-Dec)

**Archive entry format:**
```markdown
- Use npm for package management <!-- type:preference topics:tooling --> [superseded: 2026-03-04, see preferences.md#tooling]
```

### REJECTION — Structural correction worth preserving
**When:** The user corrects your approach and the correction would apply again in similar future situations (structural, not situational). Detected during conversation scan (or proactively, if your project configures a rejection-detection rule under `.claude/rules/`).
**Action:**
1. Apply the structural test: "Would this rejection apply again in a similar future situation?"
2. If structural: write entry with `type:rejection` metadata to the appropriate tier file
3. Confirm briefly: `"📝 Captured rejection: 'Don't X because Y'"`
4. If situational: skip silently
**Entry format:** Always capture both the rejected approach AND the reasoning: `- Don't X because Y <!-- type:rejection topics:... -->`
**Example:** User says "Don't add docstrings to code you didn't change" → REJECTION to preferences.md
**Undo:** If user says "undo that" or "that was situational," delete the entry entirely (no archive).

### NOOP — Already known, skip
**When:** The candidate is a duplicate of an existing entry (same info, same meaning) OR falls under the skip criteria.
**Action:** Do nothing. Log "NOOP" in the summary for transparency.

### Ambiguous Tension
**When:** Unclear whether this conflicts with an existing entry — could be a contradiction or could be a different context.
**Action:** ADD the new entry with a `(may conflict with: 'EXISTING_ENTRY')` note. Leave resolution for a future `/meditation` reconciliation pass.

### Decision Boundary: UPDATE vs ARCHIVE

| Situation | Operation | Rationale |
|-----------|-----------|-----------|
| Same fact, more detail | UPDATE | Core truth unchanged, just richer |
| Same fact, minor correction | UPDATE | Fixing, not replacing |
| Same topic, different conclusion | ARCHIVE | Old conclusion is wrong |
| Same tool category, different tool | ARCHIVE | Switched tools entirely |
| Unclear if conflict or context-dependent | ADD with tension note | Let /meditation resolve |

### Decision Boundary: REJECTION vs Other Operations

| Situation | Operation | Rationale |
|-----------|-----------|-----------|
| User corrects approach, will apply again | REJECTION | Structural — captures the "don't" with reasoning |
| User states a preference proactively | ADD | Positive preference, not a correction |
| User corrects a factual error about the system | UPDATE | Fixing existing knowledge, not a pattern |
| User says "not now" or "not for this task" | Skip (no op) | Situational, won't recur |
| User rejects approach but gives no reason | REJECTION (ask why) | Prompt briefly for reasoning to make entry useful |

## Proactive Rejection Detection

Rejections are detected during conversation scans by default. Projects that want *proactive* detection (flagging corrections the moment they happen) can add an always-loaded rule under `.claude/rules/` that references this section for the full detection logic.

### Detection Heuristics

Watch for these patterns in user messages:

- **Direct negation:** "No", "Don't do that", "Never do X", "Stop doing X"
- **Correction:** "Actually...", "That's wrong because...", "Instead of X, do Y"
- **Quality judgment:** "Too verbose", "Over-engineered", "Unnecessary", "That's overkill"
- **Pattern redirect:** "I'd prefer...", "The way I want this is...", "Do it like..."

### Structural Test

When a correction is detected, apply: **"Would this rejection apply again in a similar future situation?"**

- **Structural** (save): "Don't add verbose error handling for internal functions" — general principle
- **Situational** (skip): "No, use port 3001 for this server" — one-off for this task
- **Ambiguous**: When uncertain, lean toward saving — `/meditation` can prune later

### Proactive Flow

1. Detect correction pattern in user message
2. Apply structural test
3. If structural → save to appropriate tier and confirm: `"📝 Captured rejection: 'Don't X because Y'"`
4. If situational → skip silently (no interruption)

Confirmation is brief (one line) and non-blocking. If misjudged, user can say "undo that" or "that was situational" — delete the entry entirely (no archive).

## Cross-References Between Tier Files

When writing a new entry (ADD or UPDATE), check if the topic relates to entries in OTHER tier files. If it does, add an inline cross-reference.

### Format

```markdown
- Prefers tabs over spaces <!-- type:preference topics:code-style --> [see also: project-context.md#code-conventions]
```

### Trigger Heuristic

Add a cross-reference when ANY of these conditions are true:
1. The new entry shares a topic tag with an existing entry in a different tier file
2. The new entry references the same person, tool, or system as an entry in a different tier file
3. The new entry is a decision that was discussed in a conversation thread (preference <-> conversation link)

### Rules
- Maximum 1 cross-reference per entry (keep it lightweight)
- Use the format `[see also: FILENAME#SECTION-HEADING]` where SECTION-HEADING is the nearest markdown heading above the related entry
- Cross-references are one-directional — no need to update the target file
- Do NOT add cross-references to MEMORY.md entries

## Procedure

For each memory candidate:

0. **Detect corrections** — Before classifying memory candidates, check if the user's message contains a correction pattern (see Proactive Rejection Detection above). If a structural correction is found, generate a REJECTION candidate and proceed through steps 1-7 with it.
1. **Classify** — Which tier does this belong to? If unclear, skip (NOOP).
2. **Read** — Load the target tier file using the Read tool.
3. **Search** — Scan existing entries for related content on the same topic.
4. **Decide operation** — Based on the search results, choose: ADD, UPDATE, ARCHIVE, or NOOP.
5. **Check cross-references** — Does this memory relate to entries in OTHER tier files? If so, add a cross-reference per the Cross-References section above.
6. **Execute** — Perform the chosen operation:
   - ADD: Append new entry with metadata
   - UPDATE: Edit existing entry in-place, update metadata if needed
   - ARCHIVE: Move old entry to archive/ with supersession link, then ADD replacement
   - NOOP: Do nothing
7. **Summarize** — Track operation type and tier for the output summary.

## Output Format

**Manual invocation (with or without args):**
> Saved 3 memories: 1 ADD (preference), 1 UPDATE (project context), 1 ARCHIVE (conversation). 1 NOOP.

Or if nothing found:
> Nothing new to save.

**SessionEnd/PreCompact hook context:**
Silent — no output. Perform all judgment and writes silently.

## Post-Write Hook

**Direct Mode only** — skip this section entirely in MCP Mode (the server handles graph rebuilds).

After writing to any memory tier file (preferences.md, project-context.md, conversations.md), you may optionally run a graph/index build script if your project has one configured, e.g.:

```bash
node path/to/your-graph-build-script.js 2>/dev/null || true
```

This is a best-effort rebuild — if no such script is present, silently continue.
