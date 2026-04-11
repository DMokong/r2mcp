# r2mcp — Persistent Memory for Claude Code

Persistent, semantic, tiered memory layer for Claude Code sessions.

**The problem:** Every Claude Code session starts fresh. Context is lost. You repeat yourself.

**The fix:** r2mcp gives Claude a structured, searchable memory that survives session boundaries — stored in PostgreSQL with pgvector semantic search.

## What you get

- **6 MCP tools:** `remember`, `recall`, `search`, `meditate`, `reject`, `stats`
- **3-tier memory:** `preferences` (decisions, style) → `project-context` (architecture, state) → `conversations` (relationship, history)
- **Semantic search:** Progressive tier search with MMR diversity reranking and relevance floor filtering (Recall v2)
- **Bundled `/remember` skill:** Client-side judgment pipeline — classify → conflict-check → store

## Setup (< 10 minutes)

**Prerequisites:** Node.js 20+, Docker (or existing PostgreSQL), OpenRouter API key

### 1. Clone

```bash
git clone https://github.com/DMokong/r2mcp.git
cd r2mcp
npm install
```

### 2. Configure

```bash
cp .env.example .env
# Edit .env — set R2MCP_DATABASE_URL and R2MCP_OPENROUTER_API_KEY
```

### 3. Start Postgres (skip if you have your own)

```bash
docker compose up -d
# Wait ~10s for healthy status
```

### 4. Provision schema

```bash
npm run setup
```

This creates the `memories` table, pgvector indexes, and full-text search index. **Safe to re-run.**

### 5. Build

```bash
npm run build
```

### 6. Register in Claude Code

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

### 7. Install the /remember skill (optional but recommended)

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
