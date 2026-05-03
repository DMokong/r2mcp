# r2mcp — Persistent Memory for Claude Code

Persistent, semantic, tiered memory layer for Claude Code sessions.

**The problem:** Every Claude Code session starts fresh. Context is lost. You repeat yourself.

**The fix:** r2mcp gives Claude a structured, searchable memory that survives session boundaries — stored in PostgreSQL with pgvector semantic search.

## What you get

- **6 MCP tools:** `remember`, `recall`, `search`, `meditate`, `reject`, `stats`
- **3-tier memory:** `preferences` (decisions, style) → `project-context` (architecture, state) → `conversations` (relationship, history)
- **Semantic search:** Progressive tier search with MMR diversity reranking and relevance floor filtering (Recall v2)
- **Bundled `/remember` skill:** Client-side judgment pipeline — classify → conflict-check → store

## Setup

**Prerequisites:** Node.js 20+, OpenRouter API key. Docker optional (Option B only).

r2mcp works with any PostgreSQL + pgvector backend. The fastest path is Supabase (free tier, no Docker required).

### Option A: Supabase (no Docker required)

#### 1. Create a Supabase project

Create a free project at [supabase.com](https://supabase.com). Once created, go to **Project Settings → Database → Connection string → Direct** (not Pooler) and copy the URL (port 5432).

#### 2. Clone and configure

```bash
git clone https://github.com/DMokong/r2mcp.git && cd r2mcp && npm install
cp .env.example .env
# Set R2MCP_DATABASE_URL to your Supabase direct URL (port 5432, not 6543)
# Set R2MCP_OPENROUTER_API_KEY to your OpenRouter key
```

#### 3. Provision schema and build

```bash
npm run setup && npm run build
```

This creates the `memories` table, pgvector indexes, and full-text search index. **Safe to re-run.**

#### 4. Register in Claude Code

Add to your project's `.mcp.json`:

```json
{
  "mcpServers": {
    "memory": {
      "command": "node",
      "args": ["/path/to/r2mcp/dist/index.js"],
      "env": {
        "R2MCP_DATABASE_URL": "postgresql://postgres:[YOUR-PASSWORD]@db.[YOUR-PROJECT-REF].supabase.co:5432/postgres",
        "R2MCP_OPENROUTER_API_KEY": "your_key_here"
      }
    }
  }
}
```

Restart Claude Code. You now have `mcp__memory__remember`, `mcp__memory__recall`, etc. available.

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
        "R2MCP_OPENROUTER_API_KEY": "your_key_here"
      }
    }
  }
}
```

Restart Claude Code. You now have `mcp__memory__remember`, `mcp__memory__recall`, etc. available.

#### 7. Install the /remember skill (optional but recommended)

```bash
cp -r skills/remember .claude/plugins/
```

Then use `/remember <note>` in Claude Code to persist memories with full judgment pipeline.

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
| `recall` | Semantic + full-text search with progressive tier search |
| `search` | Filter by type, tier, topics, date range |
| `meditate` | Archive stale entries, find duplicates |
| `reject` | Mark a memory as rejected (excluded from future recall) |
| `stats` | Health check — counts, staleness, embedding status |

## Cross-Project Memory

All projects pointing at the same `R2MCP_DATABASE_URL` share a single memory pool. This is intentional — your knowledge travels with you. Namespace isolation is a v2 roadmap item.

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
R2MCP_DATABASE_URL=<your-new-url> npx tsx scripts/migrate.ts /path/to/your/memory/
```

The migration script reads `preferences.md`, `project-context.md`, and `conversations.md` from the specified directory and imports them. It's idempotent — safe to re-run.

## Memory edges (SPEC-043)

r2mcp supports a typed-relation table (`memory_edges`) that captures structural
relations between memories — `contradicts`, `supersedes`, `supports`, etc. The
`recall()` MCP tool surfaces `contradicts` / `superseded_by` relations as a new
optional `signals[]` field on the response (additive — existing clients work
unchanged).

### Running the classifier

The classifier is a manual batch process — it is NOT invoked from the MCP server
hot path. Set `ANTHROPIC_API_KEY` (separate from `R2MCP_OPENROUTER_API_KEY`,
which remains scoped to embeddings).

```bash
# Estimate cost without making API calls or writing edges
npm run edges:classify -- --dry-run

# Full run with a $1 cap
npm run edges:classify -- --max-cost=1.00

# Incremental run on memories from the last 7 days
npm run edges:classify -- --since=7d --max-cost=0.25

# Resume a prior run that hit its cap (the run_id is printed at exit and stored in
# data/edges-state.last-run)
npm run edges:classify -- --resume=<run_id>
```

State and run summaries are written under `data/edges-state.*` (JSONL append-log,
last-run sidecar, per-run JSON summary at `data/edges-state.runs/<run_id>.json`).
