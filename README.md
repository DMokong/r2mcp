# r2mcp — Persistent Memory for Claude Code

Persistent, semantic, tiered memory layer for Claude Code sessions.

**The problem:** Every Claude Code session starts fresh. Context is lost. You repeat yourself.

**The fix:** r2mcp gives Claude a structured, searchable memory that survives session boundaries — stored in PostgreSQL with pgvector semantic search.

## What you get

- **11 MCP tools:** `remember`, `recall`, `search`, `meditate`, `reject`, `stats`, `compile`, `lint`, `classify`, `dump_edges_sidecar`, `extract_entities`
- **3-tier memory:** `preferences` (decisions, style) → `project-context` (architecture, state) → `conversations` (relationship, history)
- **Semantic search:** Progressive tier search with MMR diversity reranking and relevance floor filtering (Recall v2)
- **Typed memory edges:** `contradicts`, `supersedes`, `supports`, `evolved_into`, `depends_on`, `related_to` — surfaced as signals on `recall()`
- **Wiki compile:** Regenerable browsable views — `compile()` synthesizes `memory/compiled/` from pgvector
- **Lint as a first-class op:** SQL-only structural feedback — contradictions, stale, orphans, drift, superseded_unflagged
- **Multi-provider LLM layer:** Classifier and compile work on a Max plan ($0/call), Anthropic API, or OpenRouter — picked per-invocation
- **Bundled `/remember` skill:** Client-side judgment pipeline — classify → conflict-check → store

## Setup

**Prerequisites:** Node.js 20+. An OpenRouter API key is strongly recommended — it powers semantic-search embeddings. Without one, r2mcp still works but degrades to full-text search (and tells you so via a startup warning and `warnings[]` on tool responses). Docker is optional (Option B only).

r2mcp works with any PostgreSQL + pgvector backend. The fastest path is Supabase (free tier, no Docker required).

### Option A: Supabase (no Docker required)

#### 1. Create a Supabase project

Create a free project at [supabase.com](https://supabase.com). Once created, click **Connect** (top of the dashboard) and copy the **Session pooler** connection string — port `5432`, host like `aws-0-<region>.pooler.supabase.com`, username `postgres.<project-ref>`.

> **Why the Session pooler?** The Direct connection (`db.<ref>.supabase.co:5432`) resolves to an IPv6 address, and IPv4 for direct connections is a paid add-on — on an IPv4-only network it fails with `connect ENETUNREACH`. The Session pooler is IPv4-compatible on every tier and fully supports schema setup. (Do **not** use the Transaction pooler on port `6543` — it can't run DDL; setup will refuse it.) If your network has IPv6, the Direct connection works too.

#### 2. Clone and configure

```bash
git clone https://github.com/DMokong/r2mcp.git && cd r2mcp && npm install
cp .env.example .env
# Set R2MCP_DATABASE_URL to your Session pooler URL (port 5432, not 6543)
# Set R2MCP_OPENROUTER_API_KEY to your OpenRouter key (enables semantic search)
```

#### 3. Provision schema and build

```bash
npm run setup && npm run build
```

This creates the `memories` table, pgvector indexes, and full-text search index. **Safe to re-run.**

#### 4. Register in Claude Code

Add to your project's `.mcp.json`. Use `${VAR}` expansion so credentials stay in your environment instead of the file — **`.mcp.json` is typically committed, so never paste real credentials into it**:

```json
{
  "mcpServers": {
    "memory": {
      "command": "node",
      "args": ["/path/to/r2mcp/dist/index.js"],
      "env": {
        "R2MCP_DATABASE_URL": "${R2MCP_DATABASE_URL}",
        "R2MCP_OPENROUTER_API_KEY": "${R2MCP_OPENROUTER_API_KEY}"
      }
    }
  }
}
```

Claude Code expands `${VAR}` (and `${VAR:-default}`) from your environment at launch. Inline literal values are fine only for throwaway local experiments — if you go that route, gitignore `.mcp.json` and treat any committed credential as compromised.

Restart Claude Code, then see [After setup](#after-setup-both-options).

---

### Option B: Docker (local dev)

For local development or air-gapped environments.

#### 1. Clone

```bash
git clone https://github.com/DMokong/r2mcp.git
cd r2mcp
npm install
```

#### 2. Configure

```bash
cp .env.example .env
# Edit .env — set R2MCP_DATABASE_URL and R2MCP_OPENROUTER_API_KEY
```

#### 3. Start Postgres

```bash
docker compose up -d
# Wait ~10s for healthy status
```

#### 4. Provision schema

```bash
npm run setup
```

This creates the `memories` table, pgvector indexes, and full-text search index. **Safe to re-run.**

#### 5. Build

```bash
npm run build
```

#### 6. Register in Claude Code

Add to your project's `.mcp.json`:

```json
{
  "mcpServers": {
    "memory": {
      "command": "node",
      "args": ["/path/to/r2mcp/dist/index.js"],
      "env": {
        "R2MCP_DATABASE_URL": "postgresql://r2mcp:r2mcp@localhost:5432/r2mcp",
        "R2MCP_OPENROUTER_API_KEY": "${R2MCP_OPENROUTER_API_KEY}"
      }
    }
  }
}
```

(The local Docker DB URL contains no real secret; the OpenRouter key does — keep it in your environment via `${VAR}` expansion.)

Restart Claude Code, then see [After setup](#after-setup-both-options).

## After setup (both options)

You now have `mcp__memory__remember`, `mcp__memory__recall`, etc. available. Two optional steps make memory actually get used:

### Install the /remember skill (recommended)

The bundled skill gives Claude a judgment pipeline for memory writes — classify → conflict-check → store. Copy it into your **consuming project** (the one whose `.mcp.json` registers r2mcp):

```bash
mkdir -p .claude/skills && cp -r /path/to/r2mcp/skills/remember .claude/skills/
```

Claude Code auto-discovers project skills from `.claude/skills/<name>/SKILL.md`. (For all your projects at once, use `~/.claude/skills/` instead.) Then `/remember <note>` persists memories through the full pipeline.

### Teach your agent the session loop (recommended)

r2mcp ships MCP server instructions that Claude Code loads automatically, so the agent knows the basics. For stronger habits, add a short protocol to your project's `CLAUDE.md`:

```markdown
## Memory

This project has persistent memory via the `memory` MCP server.
- At session start, `recall` context relevant to the task at hand.
- When a durable decision, preference, or correction surfaces, `remember` it
  (tier: preferences = decisions/style, project-context = architecture/state,
  conversations = session continuity).
- Run `/remember` before ending a work session to persist anything unsaved.
```

**First session on an empty database:** `recall` returning zero results is expected — start `remember`-ing as decisions come up and recall pays off within a session or two.

## Configuration

r2mcp reads its configuration from the MCP transport's environment — for
consumers, **the `.mcp.json` `env` block is the primary config surface**
(use `${VAR}` expansion for secrets):

```json
{
  "mcpServers": {
    "memory": {
      "command": "node",
      "args": ["./node_modules/r2mcp/dist/index.js"],
      "env": {
        "R2MCP_DATABASE_URL": "${R2MCP_DATABASE_URL}",
        "R2MCP_OPENROUTER_API_KEY": "${R2MCP_OPENROUTER_API_KEY}",
        "R2MCP_CLASSIFIER_PROVIDER": "claude-code",
        "R2MCP_EDGE_MAX_USD": "1.00",
        "R2MCP_COMPILE_MAX_USD": "1.00"
      }
    }
  }
}
```

| Variable | Required | What it does |
|----------|----------|--------------|
| `R2MCP_DATABASE_URL` | **Yes** | PostgreSQL + pgvector connection string. The server **fails fast at startup** if unset — it never guesses a database. |
| `R2MCP_OPENROUTER_API_KEY` | Recommended | Enables semantic-search embeddings. When unset, the server logs a startup warning and `remember`/`recall` responses carry a `warnings[]` field — everything still works full-text. |
| `R2MCP_SCOPE` | Optional | Project namespace (default `global`). Set this per-project so multiple projects can share one database without their memories colliding — see [Cross-Project Memory](#cross-project-memory). |
| `R2MCP_CLAUDE_BIN` | Sometimes | Absolute path to the `claude` binary for the $0 Max-plan provider. Needed when the spawning process's PATH doesn't include it — common under launchd jobs and some MCP hosts (e.g. `~/.local/bin/claude`). The spawn error names this variable when it's the fix. |
| `ANTHROPIC_API_KEY` | Optional | Only for `--provider=anthropic` on classifier/compile runs. |
| `R2MCP_CLASSIFIER_PROVIDER` | Optional | Pin a provider (`claude-code` \| `anthropic` \| `openrouter`) instead of auto-fallback. |
| `R2MCP_EDGE_MAX_USD` / `R2MCP_COMPILE_MAX_USD` / `R2MCP_ENTITY_MAX_USD` | Optional | Cost caps for the batch jobs (defaults `$1.00`). |

The server also loads a `.env` file from its working directory at startup
(non-clobbering — real environment variables always win). A `.env` at the
r2mcp source root is the normal path for `npm run` scripts when working from
a checkout; consumers configuring via `.mcp.json env` don't need one.

## Troubleshooting

| Symptom | Cause & fix |
|---------|-------------|
| `connect ENETUNREACH 2406:...` during setup | Supabase Direct connection is IPv6-only (IPv4 is a paid add-on) and your network is IPv4-only. Use the **Session pooler** string instead: Dashboard → Connect → Session pooler (port 5432). Setup classifies this error and says the same. |
| `Transaction-pooler URL detected (port 6543)` | The transaction pooler can't run DDL or prepared statements. Use the Session pooler (port 5432). |
| `R2MCP_DATABASE_URL is not set` | Deliberate fail-fast — set it in `.mcp.json env` or `.env`. The error lists both surfaces and the Docker default URL. |
| `embeddings disabled` warning at startup or in `warnings[]` | `R2MCP_OPENROUTER_API_KEY` is unset (or the embed call failed — the message distinguishes the two). Full-text search still works; set the key to enable semantic search. |
| `could not spawn 'claude' (ENOENT)` on classifier/compile runs | The claude CLI isn't on the spawning process's PATH. Set `R2MCP_CLAUDE_BIN` to its absolute path. |
| Fresh credentials rejected right after a Supabase password reset | The pooler caches auth-rejection state for 30–60s. Wait a minute and retry before assuming the rotation failed. |

## Running tests

The suite mixes pure-unit tests with DB-integration tests that need a local PostgreSQL + pgvector. CI runs the same flow on every push/PR (`.github/workflows/ci.yml`).

```bash
docker compose up -d        # starts Postgres + provisions r2mcp_test with pgvector
npm test                    # vitest — schema is applied automatically per run
```

- **Test database:** the suite runs against `r2mcp_test`, which `docker compose up` provisions on first init (`docker/init-test-db.sql`). If you already have a Postgres volume, create it once: `createdb r2mcp_test && psql -d r2mcp_test -c "CREATE EXTENSION vector"`.
- **Isolation guard:** a vitest `setupFile` forces `R2MCP_DATABASE_URL` to a safe local test DB before every test module, so the suite can **never** touch a production database — even if your shell or `.env` points at one (it warns and overrides). To point tests at a specific DB, set `R2MCP_TEST_DATABASE_URL`; a *remote* test DB additionally requires `R2MCP_ALLOW_REMOTE_TEST_DB=1`.
- **Live-LLM tests self-skip:** tests that need real embeddings or an LLM provider are skipped unless `R2MCP_OPENROUTER_API_KEY` (or a provider) is set, so the default run is offline and deterministic.
- **Gates:** `npm run lint` (eslint, zero warnings), `npm run format:check` (prettier), `npm run build` (tsc + schema copy).

## Operations — backup & restore

Your memories are the whole point of this server — treat the database like it can vanish, because on some hosting tiers it can. **Supabase's free tier has no PITR** (point-in-time recovery) and its automated backups are limited; a `DELETE` executed against the wrong database is unrecoverable without your own dumps.

### JSONL export / import (built in)

```bash
# Full logical backup — all scopes, all four tables, embeddings included
npm run db:export -- --out=backup-$(date +%Y-%m-%d).jsonl

# One scope only
npm run db:export -- --scope=myproject --out=myproject.jsonl

# Restore (idempotent — already-present rows are skipped, so re-runs are safe)
npm run db:import -- backup-2026-07-02.jsonl

# Validate a backup file without writing anything
npm run db:import -- backup-2026-07-02.jsonl --dry-run
```

The export is a single JSONL file: a header line (version, timestamp, per-table counts) followed by one row per line across `memories`, `entities`, `memory_edges`, `memory_entities` in FK-safe order. UUIDs and embeddings are preserved verbatim, so a restore into an empty database reproduces the full memory graph. Import conflicts (same PK, same `(project_scope, fingerprint)`, same edge triple) are skipped, and row-level failures are reported without aborting the run — the exit code is non-zero if any row failed, so scripts notice partial restores.

### pg_dump (belt and braces)

The JSONL export is portable and diffable; `pg_dump` captures everything else (indexes, constraints, roles):

```bash
pg_dump "$R2MCP_DATABASE_URL" --no-owner --no-privileges -f r2mcp-$(date +%Y-%m-%d).sql
```

### Restore drill

Do this once now, not during an incident:

1. `npm run db:export -- --out=drill.jsonl`
2. Point `R2MCP_DATABASE_URL` at a scratch database (e.g. the docker-compose Postgres) and run `npm run setup`
3. `npm run db:import -- drill.jsonl` — expect `errors: []` and inserted counts matching the export header
4. Spot-check: `recall` a memory you know, verify an edge survived

### Suggested cadence

- **Daily** `db:export` via cron/launchd to a dated file (they're small — a few MB even with embeddings)
- **Before any prod mutation** (migrations, scope re-stamps, bulk cleanups): take a fresh export first
- Keep at least a week of dailies; prune older ones

## Memory Tiers

| Tier | What goes here | Auto-archived after |
|------|---------------|---------------------|
| `preferences` | Decisions, coding style, tool choices | Never |
| `project-context` | Architecture, system state, what's built | 180 days |
| `conversations` | Relationship continuity, session history | 90 days |

## Tools Reference

| Tool | Description |
|------|-------------|
| `remember` | Store/update/archive a memory with tier + metadata |
| `recall` | Semantic + full-text search with progressive tier search; emits `signals[]` from typed edges |
| `search` | Filter by type, tier, topics, date range |
| `meditate` | Archive stale entries, find duplicates; pass `include_lint: true` to fold lint findings in |
| `reject` | Mark a memory as rejected (excluded from future recall) |
| `stats` | Health check — counts, staleness, embedding status |
| `compile` | Regenerate browsable wiki views under `memory/compiled/` (SPEC-044, see below) |
| `classify` | Classify candidate memory pairs into typed edges (supports, contradicts, supersedes, evolved_into, depends_on, related_to). Subprocess-spawned (SPEC-044 invariant). |
| `dump_edges_sidecar` | In-process JSON dump of memory_edges + memories to a caller-supplied directory. Used by downstream consumers like Memory Explorer. |
| `lint` | Surface structural feedback: contradictions, stale, orphans, drift, superseded_unflagged (SPEC-044, see below) |
| `extract_entities` | Extract structured entities (project / person / tool / decision) from memories. Spawns the entity extractor driver via the shared `resolveCliCommand` helper. Inherits cost cap (`R2MCP_ENTITY_MAX_USD`, default $1.00) and resumability from SPEC-043. Top-N known entities (`R2MCP_ENTITY_CONTEXT_TOP_N`, default 100) seed the LLM context. (SPEC-046, see below) |
| `recall` (extended) | Accepts an optional `entity` parameter that narrows results to memories linked to a named entity (matched by canonical name or any alias). When `entity` is set, `query` is optional. Response gains `entity_resolved: boolean`, optional `entity_id`, and per-result `entity_links[]`. (SPEC-046) |

## Recall v2 — semantic + budget-aware retrieval

`recall()` is the workhorse retrieval tool. v2 (xMemory-inspired, 2026-04) layers four retrieval shapes on top of the underlying hybrid semantic + full-text search:

### 1. Relevance floor — `min_score`

Filter out low-quality matches before they're returned. Without this, semantic search dumps a long tail of weakly-related results.

```ts
recall({ query: "edge classifier cost cap", min_score: 0.3 })
```

Suggested defaults: `0.3` for semantic queries, `0.1` for keyword-driven ones.

### 2. MMR diversity — `diversity` (lambda 0.0–1.0)

Maximal Marginal Relevance reranks results to balance relevance against redundancy. `1.0` is pure relevance (may return three near-duplicates of the top hit); `0.0` is pure diversity (spreads coverage); the default `0.7` favors relevance with mild diversification.

```ts
recall({ query: "memory architecture", diversity: 0.5, top_k: 8 })
```

Use lower values when you want broad coverage of a topic, higher when you want the single best answer plus close runners-up.

### 3. Context budget — `max_tokens`

Token-budget retrieval: walks MMR-reranked results in score order and stops when adding the next result would exceed the budget. Returns `tokens_used` in the response so you know how much you actually pulled.

```ts
recall({ query: "what we learned about classifiers", max_tokens: 4000 })
// → up to N results, summing to ≤4000 tokens, prioritized by relevance × diversity
```

This is the right call when you're stuffing recall results into a downstream prompt and have a hard context limit. `top_k` is ignored when `max_tokens` is set — the budget decides the cut.

### 4. Progressive tier search — `progressive` + `confidence_threshold`

Top-down retrieval through the tier hierarchy (`preferences` → `project-context` → `conversations`). High-confidence matches in `preferences` short-circuit the search before lower tiers are consulted, mimicking the xMemory observation that decisions/preferences usually answer questions before context/history needs to.

```ts
recall({ query: "do we use bun or npm", progressive: true, confidence_threshold: 0.82 })
// → returns immediately if a preferences-tier match scores ≥0.82, else widens to project-context, then conversations
```

Default behavior — turn off with `progressive: false` to force a full sweep across tiers, or pin a single tier with `tier: 'preferences'`.

### Composing them

The four parameters compose:

```ts
recall({
  query: "spec-bench cleanup conventions",
  min_score: 0.3,           // drop weak matches
  diversity: 0.6,           // some diversification
  max_tokens: 3000,         // fit in context
  progressive: true,        // early-stop on prefs hits
  confidence_threshold: 0.82,
})
```

Plus `signals[]` on the response surfaces typed memory edges (`contradicts`, `superseded_by`) on the returned memories so callers can flag conflicts inline.

## Cross-Project Memory

Multiple projects can share one database while keeping their memories separate, via the `R2MCP_SCOPE` namespace.

**Set `R2MCP_SCOPE` per-project** in each project's `.mcp.json` `env` block:

```json
"env": {
  "R2MCP_DATABASE_URL": "${R2MCP_DATABASE_URL}",
  "R2MCP_SCOPE": "my-project"
}
```

How scoping behaves:

- **Writes** (`remember`, `reject`) land in the current scope.
- **Reads** (`recall`, `search`) default to the **current scope + `global`**. So each project sees its own memories plus anything you deliberately put in the shared `global` scope. Pass `all_scopes: true` to read across every scope.
- **Destructive maintenance** (`meditate`, `lint --fix`, `compile`, the edge classifier) is confined to the current scope unconditionally — a cleanup in one project can never archive or rewrite another's data.
- **Entities** are scoped too; `global`-scoped entities resolve from any project, so you can share a common vocabulary deliberately.

**Default behavior (no `R2MCP_SCOPE` set):** everything reads and writes the `global` scope — a single shared pool, identical to pre-scope behavior. Existing memories from before you upgraded are backfilled to `global`, so nothing is lost.

**Sharing knowledge across projects:** write memories you want everywhere into the `global` scope (run that session with `R2MCP_SCOPE=global` or unset), or query with `all_scopes: true` when you explicitly want the whole store.

> **Note for scheduled jobs:** set `R2MCP_SCOPE` in the launchd/cron job's environment too, not just `.mcp.json` — a background classifier or compile run uses its own environment, and an unset scope there would operate on `global` instead of your project.

## OpenTelemetry (optional)

Enable OTel tracing and metrics:

```bash
OTEL_ENABLED=true
OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4318
```

Metrics use the `r2mcp.memory.*` namespace.

## Prior Art & Acknowledgements

r2mcp stands on the shoulders of two projects:

**[Open Brain](https://github.com/NateBJones-Projects/OB1) by [Nate B. Jones](https://natesnewsletter.substack.com/)**
The core architectural insight — "one database, any AI plugs in" — comes from Open Brain. The idea that your knowledge layer should be sovereign and portable (not locked inside a specific tool) is the founding premise of r2mcp. Open Brain proved the PostgreSQL + pgvector substrate works for personal AI memory at minimal cost ($0.10–0.30/month). r2mcp narrows the scope to Claude Code's MCP protocol and adds a more opinionated retrieval layer on top of that foundation.

**[xMemory](https://arxiv.org/abs/2602.02007) — "Beyond RAG for Agent Memory: Retrieval by Decoupling and Aggregation"**
Hu et al. (2026) established the hierarchical tier approach and showed that progressive top-down retrieval with coverage maximization + redundancy minimization cuts token usage ~50% vs. flat RAG while improving accuracy. r2mcp's 3-tier memory (preferences → project-context → conversations) is a hand-crafted simplification of their 4-level hierarchy (messages → episodes → semantics → themes). The MMR diversity reranking in `recall()` directly implements their redundancy minimization insight.

## Migrating from ClaudeClaw

If you're moving from the ClaudeClaw-internal `memory-mcp-server`:

```bash
R2MCP_DATABASE_URL=<your-new-url> npx tsx src/cli/migrate.ts /path/to/your/memory/
```

The migration script reads `preferences.md`, `project-context.md`, and `conversations.md` from the specified directory and imports them. It's idempotent — safe to re-run.

## Memory edges (SPEC-043)

r2mcp supports a typed-relation table (`memory_edges`) that captures structural
relations between memories — `contradicts`, `supersedes`, `supports`,
`evolved_into`, `depends_on`, `related_to`. The `recall()` MCP tool surfaces
`contradicts` / `superseded_by` relations as an optional `signals[]` field on
the response (additive — existing clients work unchanged).

### Running the classifier

The classifier is a manual batch process — it is NOT invoked from the MCP server
hot path. Provider selection follows the SPEC-044 precedence (see below); on a
Max plan, no API key is required.

```bash
# Estimate cost without making API calls or writing edges
npm run edges:classify -- --dry-run

# Auto-fallback: prefers claude-code (Max plan, $0/call)
npm run edges:classify -- --max-cost=1.00

# Force a specific provider
npm run edges:classify -- --provider=anthropic --max-cost=1.00
npm run edges:classify -- --provider=openrouter --max-cost=1.00

# Incremental run on memories from the last 7 days
npm run edges:classify -- --since=7d --max-cost=0.25

# Resume a prior run that hit its cap (the run_id is printed at exit and stored in
# data/edges-state.last-run)
npm run edges:classify -- --resume=<run_id>
```

State and run summaries are written under `data/edges-state.*` (JSONL append-log,
last-run sidecar, per-run JSON summary at `data/edges-state.runs/<run_id>.json`).

## LLM provider abstraction (SPEC-044)

The classifier and wiki compiler share a small `LLMProvider` abstraction with
three adapters. Providers run from standalone Node processes only — the MCP
server itself never makes LLM calls.

| Adapter | Auth | Cost per call | Concurrency cap |
|---------|------|---------------|------------------|
| `claude-code` | Claude Code OAuth (Max plan) | **$0** (strict equality) | 2 (subprocess overhead) |
| `anthropic` | `ANTHROPIC_API_KEY` | Per-token (list price) | 10 |
| `openrouter` | `R2MCP_OPENROUTER_API_KEY` | Per-token (list price) | 10 |

### Selection precedence

1. `--provider=<name>` CLI flag — highest priority
2. `R2MCP_CLASSIFIER_PROVIDER` environment variable
3. Auto-fallback: `claude-code` if logged in → `anthropic` if API key set →
   `openrouter` if API key set → fatal error naming all three remediation paths

The fallback prefers `claude-code` so a Max-plan user pays nothing by default.

OpenRouter's primary role remains text→vector embeddings. Its classifier /
compile use is opt-in per invocation, never auto-routed for embeddings.

## Wiki compile (SPEC-044)

`compile()` regenerates browsable markdown views of the memory store from
pgvector. Output goes to `memory/compiled/` (gitignored, regenerable).

```bash
# Compile all three tier files (preferences.md, project-context.md, conversations.md)
npm run compile-wiki -- --all

# Compile a single tier
npm run compile-wiki -- --tier=preferences

# Compile a per-topic page
npm run compile-wiki -- --topic=wiki-mode

# Preview without writing
npm run compile-wiki -- --all --dry-run

# Force a provider (otherwise uses auto-fallback)
npm run compile-wiki -- --all --provider=claude-code
```

### Output shape

Every compiled file carries YAML frontmatter recording `generated_at`,
`compile_run_id`, `source_count`, `source_memory_ids`, `provider`,
`source_git_sha`, and `tier` or `topic`. The body is structured prose with
inline `<m:id>` citations and a `Sources:` line per cluster.

### Structural stability

Compile is treated as a regenerable view: across two runs against the same
input, the set of `## H2` / `### H3` headers and the set of cited memory IDs
are bit-identical. Prose-level variance is bounded at 5% (Levenshtein ratio
≥ 0.95) — the only LLM nondeterminism allowance. The compiler controls
headers and citations; only the prose paragraphs come from the LLM.

### Cost cap

`R2MCP_COMPILE_MAX_USD` (default `$1.00`) — when exceeded mid-run, compile
exits cleanly with `hit_cost_cap: true` and partial files. Same shape as the
classifier cap-hit behavior.

### What compile never does

- Modifies `memory/MEMORY.md` — the human-curated hub stays invariant
- Writes outside `memory/compiled/`
- Touches the live `memories` or `memory_edges` tables — read-only at the DB layer
- Uses any direct Anthropic SDK call — every synthesis routes through `LLMProvider`

## Lint (SPEC-044)

`lint()` surfaces five structural checks on the memory store. SQL-only — no
LLM calls, no cost cap.

```bash
# Run all checks against the live DB and produce a human-readable report
npm run lint:memory

# Run a single check
npm run lint:memory -- --check=stale

# Apply auto-fixes for high-confidence findings
npm run lint:memory -- --fix
```

| Check | What it surfaces |
|-------|-------------------|
| `contradictions` | Edges where `relation='contradicts'` between two unarchived memories |
| `stale` | Memories older than 90d with zero incoming edges, tier ≠ preferences |
| `orphans` | Memories with zero edges in either direction, older than 30d |
| `drift` | Pairs sharing ≥2 topics with no edge yet — classifier hasn't run on this pair |
| `superseded_unflagged` | `contradicts` edge where the temporal pattern says it should be `supersedes` |

### `--fix` semantics

`lint --fix` only acts on findings with `confidence ≥ 0.9`:

- `stale` → memory is archived (`type='archived'`)
- `superseded_unflagged` → edge type is rewritten from `contradicts` to `supersedes`

Lower-confidence findings are returned as suggestions only, never auto-acted.

### `meditate` integration

`meditate({include_lint: true})` runs lint first and surfaces findings as a
`lint_findings` field on the response. The default invocation
(`meditate({mode: 'full', dry_run: false})`) returns the byte-identical
pre-spec response shape — backward compatibility for direct callers is
preserved.

## Entity extraction (SPEC-046)

Light entity extraction over the memory store — pulls structured `project` /
`person` / `tool` / `decision` entities out of memories, persists them to two
new tables (`entities` for canonical names + aliases, `memory_entities` for the
M:N link to `memories`), and lets `recall()` filter on entity name or alias.

The extractor is a subprocess-driven batch process — the MCP server itself
never makes LLM calls. Provider selection follows the SPEC-044 precedence; on a
Max plan, no API key is required.

```bash
# One-shot batch extraction over the last week, capped at $0.50
npm run entities:extract -- --since-days=7 --max-cost=0.5

# Or via MCP tool from any client
# mcp.callTool('extract_entities', { since_days: 7, max_cost_usd: 0.5 })

# Then ask for Speculator-scoped recall
# mcp.callTool('recall', { entity: 'Speculator', query: 'compaction' })
```

### Env vars

| Variable | Default | What it controls |
|----------|---------|------------------|
| `R2MCP_ENTITY_MAX_USD` | `1.00` | Cost cap for a single extraction run. On overrun, the run exits cleanly with `hit_cost_cap: true` (same shape as the classifier and compile caps). |
| `R2MCP_ENTITY_CONTEXT_TOP_N` | `100` | Number of known entities seeded into the LLM context to bias toward canonical names + alias merging. |

### Scoped recall

When `recall()` is called with `entity` set:

- `query` is optional — entity-only recall returns all memories linked to the entity (matched by canonical name or any alias).
- The response carries `entity_resolved: boolean` and, when resolved, `entity_id`.
- Each result carries an `entity_links[]` array describing how that memory connects to the named entity.

## License

[MIT](LICENSE)
