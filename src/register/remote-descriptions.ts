// SPEC-059 (R8) — tool descriptions for the remote (claude.ai connector) profile.
//
// These are the design.md §6 texts, verbatim as the starting draft. They exist
// as profile-specific OVERRIDES rather than replacements: the stdio texts in
// src/register/<tool>.ts stay byte-identical (AC6), and only the remote entry
// point passes these through ToolContext.description.
//
// Why they read differently from the stdio texts: chat connectors do not
// reliably surface the server's `initialize` instructions, so each description
// has to be self-sufficient — "what is inside and when to reach for it", not
// what the function does mechanically. Ambient invocation (AC9) is the thing
// being optimised for, and the tool description is assumed to be the only
// thing the model sees.
//
// Tuning these against a real chat session is Task 06's job (conditional on
// Task 04's AC9 evidence). Until then they are frozen as the §6 draft — the
// tests assert them verbatim so a drive-by reword can't silently change what
// claude.ai sees.

export const RECALL_DESCRIPTION =
  "Dustin's personal long-term memory: past decisions and their rationale, stated preferences and corrections, project architecture and state, and prior conversations. Call this before answering anything about his projects, tools, people, working style, or past choices — including when he refers to something as though you should already know it. Cheap to call; prefer calling it over guessing. An empty result is normal and not an error.";

export const REMEMBER_DESCRIPTION =
  "Store something durable in Dustin's long-term memory. Call when a decision with its rationale, a stated preference or correction, or project state worth carrying forward surfaces. Use tier `preferences` for decisions/style/corrections, `project-context` for architecture and system state, `conversations` for session continuity. Use operation `REJECTION` when he corrects an approach and the correction would apply again.";

export const SEARCH_DESCRIPTION =
  'Metadata-filtered lookup over the same memory as `recall`. Use when you know the *shape* of what you want (type, tier, topics, people, date range); use `recall` when you know what it is *about*.';

export const STATS_DESCRIPTION =
  'Health of the memory store: counts by tier and type, staleness, top topics, embedding index status.';

export const REJECT_DESCRIPTION =
  'Mark a stored memory as wrong or unwanted, with a reason. Excluded from future `recall` and `search`.';

/**
 * MCP `initialize` instructions for the remote profile.
 *
 * Deliberately much shorter than SERVER_INSTRUCTIONS (the stdio text): §6
 * assumes chat clients may not surface server instructions at all, so this is
 * a belt-and-braces session loop, not the primary carrier of guidance. Keep it
 * to a handful of lines — the tool descriptions do the real work.
 */
export const REMOTE_INSTRUCTIONS = `Dustin's long-term memory, shared with every surface he works on (Claude Code, Slack, scheduled jobs).
Call recall before answering anything about his projects, tools, people, working style, or past decisions — including when he refers to something as though you already know it.
Call remember when a durable decision with its rationale, a stated preference, or project state worth carrying forward surfaces; use operation REJECTION when he corrects an approach and the correction would apply again.
An empty recall result is normal, not an error — answer normally rather than retrying.`;
