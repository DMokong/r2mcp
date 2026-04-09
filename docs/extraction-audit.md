# r2mcp Extraction Audit

**Source:** `memory-mcp-server/` in ClaudeClaw workspace
**Audit date:** 2026-04-10
**Spec:** SPEC-038

This document records all ClaudeClaw-specific assumptions identified during extraction,
their locations, and how each was resolved.

## Findings

### 1. Env var: MEMORY_DB_URL → DATABASE_URL
- **Files:** `src/db.ts`, `tests/setup.ts`, `scripts/migrate.ts`
- **Issue:** `MEMORY_DB_URL` is a ClaudeClaw-specific name. Generic projects expect `DATABASE_URL`.
- **Resolution:** Renamed to `DATABASE_URL` in all three files.

### 2. Default DB credentials: `postgresql://cindy:cindy@localhost:5433/cindy_memory`
- **File:** `src/db.ts`
- **Issue:** `cindy` username/password and `cindy_memory` database name are Cindy persona references. Port 5433 is ClaudeClaw-specific (avoids conflicts with existing Postgres).
- **Resolution:** Default changed to `postgresql://localhost:5432/r2mcp`. Docker Compose uses `r2mcp:r2mcp@localhost:5432/r2mcp`.

### 3. Env var: OPEN_ROUTER_API_KEY → OPENROUTER_API_KEY
- **File:** `src/embeddings.ts`
- **Issue:** `OPEN_ROUTER_API_KEY` is ClaudeClaw's naming convention. The canonical env var used in OpenRouter's own docs is `OPENROUTER_API_KEY`.
- **Resolution:** Renamed to `OPENROUTER_API_KEY`.

### 4. HTTP headers: ClaudeClaw identity in OpenRouter requests
- **File:** `src/embeddings.ts`
- **Issue:** `HTTP-Referer: 'https://github.com/dustincheng/claudeclaw'` and `X-Title: 'ClaudeClaw Memory Recall'` identify requests as coming from ClaudeClaw.
- **Resolution:** Updated to `HTTP-Referer: 'https://github.com/DMokong/r2mcp'` and `X-Title: 'r2mcp'`.

### 5. OTel activation: OTEL_EXPORTER_OTLP_ENDPOINT presence → OTEL_ENABLED=true
- **File:** `src/instrumentation.ts`
- **Issue:** ClaudeClaw enables OTel by checking if `OTEL_EXPORTER_OTLP_ENDPOINT` is set. Generic projects may set this env var for other purposes without wanting r2mcp to activate OTel.
- **Resolution:** Explicit `OTEL_ENABLED=true` flag per spec AC6.

### 6. OTel service name: `claudeclaw-memory-mcp` → `r2mcp`
- **File:** `src/instrumentation.ts`
- **Issue:** Service name embeds ClaudeClaw identity.
- **Resolution:** Changed to `r2mcp`.

### 7. OTel metric names: `claudeclaw.memory.*` → `r2mcp.memory.*`
- **File:** `src/telemetry.ts`
- **Issue:** Metric namespace embeds ClaudeClaw identity.
- **Resolution:** All metric names updated to `r2mcp.memory.*`.

### 8. Tool descriptions: "Cindy's memory"
- **File:** `src/index.ts`
- **Issue:** Tool descriptions say "Cindy's long-term memory system" and "Cindy's memory" — persona references.
- **Resolution:** Replaced with generic descriptions ("the long-term memory system", "memory").

### 9. Server name: `memory-mcp-server` → `r2mcp`
- **File:** `src/index.ts`
- **Issue:** Server name is the ClaudeClaw package name, not the standalone package name.
- **Resolution:** Changed to `r2mcp`.

### 10. Schema comment: `-- Cindy Memory MCP Server` → `-- r2mcp`
- **File:** `src/schema.sql`
- **Issue:** First-line comment embeds persona reference.
- **Resolution:** Changed to `-- r2mcp — Database Schema`.

### 11. graph-rebuild.ts: unconditional `scripts/build-memory-graph.js` call
- **File:** `src/graph-rebuild.ts`
- **Issue:** Unconditionally tries to run `scripts/build-memory-graph.js`, a ClaudeClaw-only script. Would crash on any other installation.
- **Resolution:** Added `existsSync` guard — silent no-op if script is missing.

### 12. Package metadata: name and description
- **File:** `package.json`
- **Issue:** `name: "memory-mcp-server"` and description references "Cindy's memory system".
- **Resolution:** `name: "r2mcp"`, generic description.

### 13. Test default DB: `cindy_memory_test`
- **File:** `tests/setup.ts`
- **Issue:** Default test DB URL uses `cindy` persona credentials and port 5433.
- **Resolution:** Changed to `postgresql://localhost:5432/r2mcp_test`.

### 14. Migration script: hardcoded default memory dir `../../memory`
- **File:** `scripts/migrate.ts`
- **Issue:** Default memory dir resolves to `~/projects/claudeclaw/memory/` — a ClaudeClaw-specific path.
- **Resolution:** Removed default. CLI argument is now required with a helpful error message.

### 15. Test files: OPEN_ROUTER_API_KEY env var references
- **Files:** `tests/embeddings.test.ts`, `tests/gauntlet.test.ts`
- **Issue:** Test files reference `OPEN_ROUTER_API_KEY` (ClaudeClaw naming) rather than `OPENROUTER_API_KEY`.
- **Resolution:** Updated to `OPENROUTER_API_KEY` in all test files.

### 16. /remember skill: hardcoded ClaudeClaw memory paths
- **File:** `skills/remember/SKILL.md`
- **Issue:** Direct Mode fallback section referenced exact paths under `~/.claude/projects/-Users-dustincheng-projects-claudeclaw/memory/`.
- **Resolution:** Replaced with generic `<project-hash>` placeholders.

## Files with No ClaudeClaw Assumptions (copied verbatim)

- `src/fingerprint.ts` — pure crypto utility
- `src/tools/meditate.ts` — pure DB logic
- `src/tools/recall.ts` — pure DB + embedding logic
- `src/tools/reject.ts` — pure DB logic
- `src/tools/remember.ts` — pure DB + embedding logic
- `src/tools/search.ts` — pure DB logic
- `src/tools/stats.ts` — pure DB logic
- Most test files (once env var names corrected in embeddings/gauntlet tests)
