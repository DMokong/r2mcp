# Changelog

All notable changes to r2mcp. Versions follow [semver](https://semver.org/);
entries reference the internal spec numbers that shipped them.

## [Unreleased]

## [0.5.1] — 2026-10-06

### Fixed

- **DATE columns read back a day early** (trk-fj8): node-pg's default DATE
  parser builds a JS `Date` at local midnight, so for anyone east of UTC a
  stored `2026-05-12` came back as `2026-05-11`. `connectDb()` now registers
  an identity parser for DATE (OID 1082) — a DATE has no time component, so
  the stored `YYYY-MM-DD` string is the correct representation. Stored values
  were never wrong and are not rewritten.
- **`search()` threw on any dated row once DATE read back as a string**
  (trk-59i): the result mapper still called `row.date.toISOString()`.
  `search()` now returns the stored string as-is, with a regression test that
  searches dated and undated memories.
- **`search()` scope resolution** (trk-cou): the metadata-filter path built its
  own inline `project_scope` predicate that only ever resolved current +
  global — unlike `recall()`, `search()` had no `scope` parameter at all. A
  filter-only query against a non-default scope (e.g. the ai-landscape index's
  `date:YYYY-MM-DD` topic key) silently returned zero rows unless the caller
  passed `all_scopes: true`, indistinguishable from "no data that day."
  `search()` now takes the same `scope` parameter as `recall()` and resolves
  it through the same `scopeClause()` helper, for every filter key (topics,
  created_after/before, tier, type, persons) — not just topics.

## [0.5.0] — 2026-09-27

### Added

- **Classifier primitive** (trk-7mx): `ClassifierProvider` — bounded question
  + enumerated answers + probabilities, never prose — separate from
  `LLMProvider.complete()`, shaped like TypeSafe's System One wire API.
  Backends: `typesafe` (hosted Jev; remote egress, refused at construction
  unless the scope is listed in `R2MCP_REMOTE_CLASSIFIER_SCOPES`, default
  `ai-landscape,public-fixture`), `openjev` (a local OpenJev server,
  `R2MCP_OPENJEV_URL` / `R2MCP_OPENJEV_MODEL`), and `llm-enum` (any
  `LLMProvider` forced onto the enum). New dependency: `@typesafe-ai/sdk`.
- **Stage-1 shadow trial** (trk-7mx): `R2MCP_EDGE_STAGE1_SHADOW=typesafe|openjev`
  scores every `classify-edges` Stage-1 pair with that classifier as well and
  logs ids + scores to `data/edges-shadow.jsonl`; decisions are unchanged and
  the shadow can never fail the run. Pairs touching health- or
  finance-related memories (topic, section, or text) are never sent to a
  remote classifier. `npm run edges:shadow-report` summarises agreement and
  lists candidate missed edges.
- **Classifier shadow-eval harness** (trk-7mx.1): `eval:corpus`,
  `eval:classifiers` — schema-validated corpora, hash-pinned public fixture,
  human-label-only accuracy, Stage-1 AUC / threshold sweep / calibration,
  fixed-cohort Stage-2 and cascade metrics, per-pair failure accounting.
- **Remote profile** (spec-059, previously unreleased on main): the 5-tool
  memory profile over streamable HTTP with MCP resource-server auth.

## [0.4.1] — 2026-09-27

### Fixed

- **Edge classification no longer dies on one bad LLM reply** (trk-6qd). A
  single unparseable Stage-2 reply threw out of `classify-edges` and aborted
  the whole run — every nightly run in production was failing this way (e.g.
  a rationale containing unescaped quotes). Stage 1 now reads only the leading
  YES/NO token (multi-line reasons, `**bold**`, an `Answer:` prefix are fine);
  Stage 2's output budget is 512 tokens (was 256), a reply that breaks after
  `relation` and `confidence` is salvaged with its rationale marked
  `[truncated]`, and both stages retry once on a reply with no usable fields.

### Changed

- **Recall-biased Stage-1 filter** (trk-7mx.3). A Stage-1 miss is permanent;
  a false pass costs one Stage-2 call that can still answer `none`. Measured
  live against 50 hand-labelled pairs: recall 0.59 → 0.69 at unchanged
  precision 1.00; on the public 42-pair fixture 0.77 → 0.88 (AUC 0.94).

## [0.4.0] — 2026-08-09

### Changed

- **Env-resolvable model tiers** (claw-x1mg): call sites request a purpose,
  not a model; see `src/model-tier.ts`.

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
