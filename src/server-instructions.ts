/**
 * MCP server instructions (claw-8cjf.8) — sent in the initialize response and
 * loaded into the agent's context by Claude Code at session start. This is the
 * only guidance a fresh project's agent gets, so it must teach the session
 * loop on its own. Claude Code truncates at 2,048 characters; keep critical
 * content near the start. Lives in its own module because src/index.ts runs
 * main() on import and cannot be imported by tests.
 */
export const SERVER_INSTRUCTIONS = `Persistent memory across Claude Code sessions, stored in PostgreSQL with semantic search.

Session loop:
1. At session start, call recall with a query about the current task to load relevant context (e.g. recall({query: "<topic you are working on>"})).
2. During work, call remember when something durable surfaces — a decision with its rationale, a user preference or correction, project state worth carrying forward. Choose the tier: "preferences" (decisions, style, corrections — never expires), "project-context" (architecture, system state), "conversations" (session continuity).
3. When the user corrects your approach and the correction would apply again in future situations, store it with operation "REJECTION" so it is excluded from normal recall but prevents repeating the mistake.

Cold start: on a new, empty database, recall returns zero results — that is expected, not an error. Begin storing memories as durable facts emerge and recall becomes useful within a session or two.

Degraded mode: responses may carry a warnings[] field (e.g. embeddings disabled because R2MCP_OPENROUTER_API_KEY is unset — search falls back to full-text). Surface such warnings to the user once rather than ignoring them.

The other tools (search, stats, meditate, reject, compile, lint, classify, extract_entities, dump_edges_sidecar) are for browsing, curation, and batch maintenance — recall and remember are the everyday pair.`;
