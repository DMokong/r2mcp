# Changelog

All notable changes to r2mcp. Versions follow [semver](https://semver.org/);
entries reference the internal spec numbers that shipped them.

## [Unreleased]

## [0.3.0] — 2026-07-03

### Changed

- **Compact recall responses** (claw-ohhj.3): scores round to 3 decimals; one
  timestamp per result (`updated`); the `query` echo, `total_results`
  (derivable from `results.length`), false `early_stopped`, empty `signals`,
  and empty `persons` are elided; and every tool response now serializes
  compactly (no pretty-print indentation). Measured 28–43% smaller recall
  payloads on representative corpora — paid on every recall in every session.

### Added

- **Project-scope namespacing** (claw-nyxd): multiple projects can share one
  database without their memories colliding. New `R2MCP_SCOPE` env var (default
  `global`) namespaces every memory and entity. Reads (`recall`/`search`)
  default to the current scope + `global`, with `all_scopes: true` to read
  across everything; writes land in the current scope; destructive maintenance
  (`meditate`, `lint --fix`, `compile`, the edge classifier) is confined to the
  current scope unconditionally. Entities are scoped too (`global` entities
  resolve everywhere). Idempotent migration backfills existing rows to `global`
  and swaps the `unique(fingerprint)` constraint for `(project_scope,
  fingerprint)`. The server logs its resolved scope at startup. See README →
  Cross-Project Memory.
- **Per-call scope overrides** (claw-sdcn.1): `remember` accepts a `scope`
  parameter to write into a specific project scope, and `recall` accepts
  `scope` to read a specific scope (+ `global`) — one connected server can
  service multiple corpora without a restart.
- **Backup & restore CLI** (claw-i6td.4): paired JSONL export/import —
  `npm run db:export -- [--out=<file>] [--scope=<name>]` (all scopes by
  default) and `npm run db:import -- <file> [--dry-run]` (idempotent; per-row
  errors never abort; exit 1 if any row failed). Format v1 envelopes all four
  tables in FK-safe order with UUIDs and embeddings verbatim. See README →
  Operations: backup & restore.
- **Versioned schema migrations** (claw-i6td.5): `schema_migrations` table +
  numbered migrations under `migrations/`; `npm run migrate` applies pending
  migrations and the server verifies the schema version at boot.
- GitHub Actions CI with disposable test-DB provisioning, structural
  prod-DB test isolation (destructive suites refuse non-test databases), and
  a zero-warnings eslint gate (claw-i6td.1–.3, .6).

### Fixed

- `compile` Timeline sections order by `event_date` (not row `created_at`)
  and render single-line excerpts (PR #5).

## [0.2.0] — 2026-06-13

First release packaged for use beyond the original workspace.

### Added

- **npm bins**: `r2mcp` (the MCP server) and `r2mcp-setup` (schema provisioner) —
  `.mcp.json` can now use `npx -y r2mcp` instead of an absolute dist path.
- **MCP server instructions** sent in the initialize response — a fresh project's
  agent learns the recall-at-start / remember-as-you-go loop with zero setup.
- **`warnings[]` on `remember`/`recall`** when embeddings are unavailable,
  distinguishing *disabled* (no `R2MCP_OPENROUTER_API_KEY`) from *failed*.
- **Fail-fast configuration**: the server and `npm run setup` refuse to start
  without `R2MCP_DATABASE_URL` (previously defaulted silently to localhost);
  startup logs a warning when embeddings are off.
- **`extract_entities` tool + entity-scoped `recall`** (SPEC-046): light entity
  extraction (project/person/tool/decision) with alias merging and cost caps.
- **`next_tools[]` breadcrumbs** on every tool response (SPEC-047): context-aware
  follow-up suggestions, capped at 3.
- **MCP-only operation** (SPEC-045): `classify` and `dump_edges_sidecar` promoted
  to MCP tools; subprocess spawning centralized via `resolveCliCommand`;
  `R2MCP_CLAUDE_BIN` escape hatch for sanitized-PATH hosts (now documented, and
  named in ENOENT spawn errors).
- **MIT LICENSE**, engines field, repository metadata, this changelog.

### Changed

- **Single-rootDir build**: CLI drivers moved from `scripts/` to `src/cli/`;
  the dual compile tree (`dist/` + `dist/src/`, 43 duplicate files) is gone and
  `schema.sql` is copied once. `npm run` script names are unchanged.
- **README onboarding overhaul**: Supabase **Session pooler** is the recommended
  connection (the Direct connection is IPv6-only without a paid add-on; setup
  classifies `ENETUNREACH` accordingly); `.mcp.json` examples use `${VAR}`
  expansion with a secret-hygiene warning; the bundled `/remember` skill install
  corrected to `.claude/skills/`; new Configuration table and Troubleshooting
  section.

### Fixed

- **`.env` loader regex could not match any `R2MCP_*` key** (the digit excluded
  by `[A-Z_]+`) — every documented fresh-clone setup silently fell back to
  localhost. All five hand-rolled loaders replaced by a shared `loadEnvFile()`.
- CLI drivers load `.env` only on their CLI entry path, never at module import
  (a module-level load leaked the consumer's DB URL into test processes).
- `lint:memory` previously loaded no environment at all.

## [0.1.0] — 2026-05-09

Initial extraction from the ClaudeClaw workspace (SPEC-041 through SPEC-044).

- 9 MCP tools: `remember`, `recall`, `search`, `meditate`, `reject`, `stats`,
  `compile`, `lint`, `classify` over PostgreSQL + pgvector (Docker or Supabase
  free tier).
- 3-tier memory (preferences / project-context / conversations) with semantic +
  full-text hybrid retrieval, MMR diversity, progressive tier search,
  token-budget retrieval (Recall v2).
- Typed memory edges (SPEC-043) surfaced as `signals[]` on recall.
- Wiki mode (SPEC-044): regenerable compiled views, SQL-only lint
  (contradictions / stale / orphans / drift / superseded_unflagged).
- Multi-provider LLM layer: claude-code (Max plan, $0/call), Anthropic API,
  OpenRouter — batch jobs only; the MCP server itself never makes LLM calls.
