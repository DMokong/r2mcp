#!/usr/bin/env node
// OTel instrumentation MUST be imported first — before any other module
import './instrumentation.js';

import { resolve } from 'node:path';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { initDb } from './db.js';
import { remember } from './tools/remember.js';
import { recall } from './tools/recall.js';
import { search } from './tools/search.js';
import { stats } from './tools/stats.js';
import { reject } from './tools/reject.js';
import { meditate } from './tools/meditate.js';
import { compile } from './tools/compile.js';
import { classify } from './tools/classify.js';
import { extractEntitiesTool } from './tools/extract-entities.js';
import { dumpEdgesSidecarTool } from './tools/dump-edges-sidecar.js';
import { lint } from './tools/lint.js';
import { loadEnvFile, currentScope } from './env.js';
import { SERVER_INSTRUCTIONS } from './server-instructions.js';
import { EMBEDDINGS_DISABLED_WARNING } from './embeddings.js';
import { withToolSpan } from './telemetry.js';
import { asMcpResponse } from './mcp-response.js';

// Re-export for backwards compatibility with anything that imported asMcpResponse
// from src/index.js before SPEC-047's mcp-response.ts split. New callers should
// import directly from './mcp-response.js'.
export { asMcpResponse };

// Load .env from project root — MCP servers don't inherit parent env vars
const PROJECT_ROOT = process.env.PROJECT_ROOT || process.cwd();
loadEnvFile(resolve(PROJECT_ROOT, '.env'));

// claw-nyxd: resolve the project scope once at startup (after .env load).
const CURRENT_SCOPE = currentScope();

const server = new McpServer(
  {
    name: 'r2mcp',
    version: '0.2.0',
  },
  // Sent in the initialize response; Claude Code loads this into the agent's
  // context at session start (claw-8cjf.8 — first-session guidance).
  { instructions: SERVER_INSTRUCTIONS },
);

server.tool(
  'remember',
  'Store, update, or archive a memory in the long-term memory system. Response includes a next_tools[] array of {name, usage, why} suggested follow-ups (may be empty).',
  {
    operation: z.enum(['ADD', 'UPDATE', 'ARCHIVE', 'REJECTION', 'NOOP']),
    tier: z.enum(['preferences', 'project-context', 'conversations']),
    content: z.string(),
    metadata: z.object({
      type: z.enum([
        'preference',
        'decision',
        'context',
        'relationship',
        'observation',
        'rejection',
      ]),
      topics: z.array(z.string()).optional(),
      people: z.array(z.string()).optional(),
      section: z.string().optional(),
      date: z.string().optional(),
    }),
    target_id: z.string().optional(),
    scope: z
      .string()
      .optional()
      .describe(
        'Write to a specific project scope instead of the default (e.g. "ai-landscape" for digest extracts). Defaults to the server scope.',
      ),
  },
  async (args) => {
    const result = await withToolSpan(
      'remember',
      {
        operation: args.operation,
        tier: args.tier,
      },
      async (span) => {
        const r = await remember(
          {
            operation: args.operation,
            tier: args.tier,
            content: args.content,
            metadata: args.metadata,
            target_id: args.target_id,
          },
          PROJECT_ROOT,
          args.scope ?? CURRENT_SCOPE,
        );
        span.setAttribute('dedup_triggered', r.dedup ?? false);
        return r;
      },
    );

    return asMcpResponse('remember', result, args);
  },
);

server.tool(
  'recall',
  'Search memory using semantic similarity and full-text search. Supports progressive tier search, MMR diversity, relevance floor, and token-budget-based retrieval. Response includes a next_tools[] array of {name, usage, why} suggested follow-ups (may be empty).',
  {
    query: z
      .string()
      .optional()
      .default('')
      .describe(
        'Free-text query. Optional when `entity` is provided — SPEC-046 entity-only recall short-circuits without a query.',
      ),
    top_k: z.number().optional().default(10),
    tier: z.enum(['preferences', 'project-context', 'conversations']).optional(),
    max_tokens: z
      .number()
      .optional()
      .describe('Token budget — return results until budget is exhausted'),
    min_score: z
      .number()
      .optional()
      .describe(
        'Minimum relevance score threshold (default: 0.0). Suggested: 0.3 for semantic, 0.1 for fulltext.',
      ),
    diversity: z
      .number()
      .min(0)
      .max(1)
      .optional()
      .describe('MMR lambda: 1.0 = pure relevance, 0.0 = pure diversity (default: 0.7)'),
    progressive: z
      .boolean()
      .optional()
      .describe(
        'Search tiers top-down, stopping early when high-confidence results found (default: true)',
      ),
    confidence_threshold: z
      .number()
      .optional()
      .describe('Raw score threshold for progressive early-stop (default: 0.82)'),
    entity: z
      .string()
      .optional()
      .describe(
        'SPEC-046: filter results to memories linked to this entity (canonical_name or alias; case-insensitive). When set, response adds entity_resolved/entity_id and per-result entity_links.',
      ),
    all_scopes: z
      .boolean()
      .optional()
      .describe(
        'Search across ALL project scopes instead of the current scope + global (default: false).',
      ),
    scope: z
      .string()
      .optional()
      .describe(
        'Read a SPECIFIC project scope (+ global) instead of the server scope — e.g. "ai-landscape" to read that wiki corpus. Ignored when all_scopes is true.',
      ),
  },
  async (args) => {
    const queryStr = args.query ?? '';
    const result = await withToolSpan(
      'recall',
      {
        query_length: queryStr.length,
        tier: args.tier || 'all',
        top_k: args.top_k,
        progressive: args.progressive ?? true,
        entity: args.entity ?? '',
      },
      async (span) => {
        const r = await recall({
          query: queryStr,
          top_k: args.top_k,
          tier: args.tier,
          max_tokens: args.max_tokens,
          min_score: args.min_score,
          diversity: args.diversity,
          progressive: args.progressive,
          confidence_threshold: args.confidence_threshold,
          entity: args.entity,
          all_scopes: args.all_scopes,
          scope: args.scope,
        });
        span.setAttribute('result_count', r.results.length);
        span.setAttribute('search_mode', r.search_mode ?? 'unknown');
        span.setAttribute('early_stopped', r.early_stopped ?? false);
        span.setAttribute('tiers_searched', (r.tiers_searched ?? []).join(','));
        span.setAttribute('tokens_used', r.tokens_used ?? 0);
        return r;
      },
    );

    return asMcpResponse('recall', result, args);
  },
);

server.tool(
  'search',
  'Search memory using structured metadata filters (type, tier, topics, persons, date range) with optional full-text query. Response includes a next_tools[] array of {name, usage, why} suggested follow-ups (may be empty).',
  {
    filter: z
      .object({
        type: z.string().optional(),
        tier: z.string().optional(),
        topics: z.array(z.string()).optional(),
        persons: z.array(z.string()).optional(),
        created_after: z.string().optional(),
        created_before: z.string().optional(),
      })
      .optional(),
    query: z.string().optional(),
    limit: z.number().optional(),
    all_scopes: z
      .boolean()
      .optional()
      .describe(
        'Search across ALL project scopes instead of the current scope + global (default: false).',
      ),
  },
  async (args) => {
    const result = await withToolSpan(
      'search',
      {
        has_query: !!args.query,
        tier_filter: args.filter?.tier || 'all',
      },
      async (span) => {
        const r = await search({
          filter: args.filter,
          query: args.query,
          limit: args.limit,
          all_scopes: args.all_scopes,
        });
        span.setAttribute('result_count', r.count ?? 0);
        return r;
      },
    );

    return asMcpResponse('search', result, args);
  },
);

server.tool(
  'stats',
  'Get system health statistics for r2mcp memory — counts by tier/type, staleness, top topics, embedding index status. Response includes a next_tools[] array of {name, usage, why} suggested follow-ups (may be empty).',
  {},
  async () => {
    const result = await withToolSpan('stats', {}, async (span) => {
      const r = await stats();
      span.setAttribute('total_entries', r.total ?? 0);
      return r;
    });

    return asMcpResponse('stats', result, {});
  },
);

server.tool(
  'reject',
  'Mark an existing memory as rejected and store the rejection reason. Rejected memories are excluded from recall and search results. Response includes a next_tools[] array of {name, usage, why} suggested follow-ups (may be empty).',
  {
    id: z.string(),
    reason: z.string(),
  },
  async (args) => {
    const result = await withToolSpan('reject', { target_id: args.id }, async () => {
      return reject({ id: args.id, reason: args.reason }, CURRENT_SCOPE);
    });

    return asMcpResponse('reject', result, args);
  },
);

server.tool(
  'meditate',
  'Run memory consolidation — archives stale entries, checks for duplicates, finds cross-references, clusters by theme, and surfaces gaps. Response includes a next_tools[] array of {name, usage, why} suggested follow-ups (may be empty).',
  {
    mode: z.enum(['full']).default('full'),
    dry_run: z.boolean().optional().default(false),
    include_lint: z.boolean().optional().default(false),
  },
  async (args) => {
    const result = await withToolSpan(
      'meditate',
      {
        mode: args.mode,
        dry_run: args.dry_run,
        include_lint: args.include_lint,
      },
      async (span) => {
        const r = await meditate(
          { mode: args.mode, dry_run: args.dry_run, include_lint: args.include_lint },
          PROJECT_ROOT,
          CURRENT_SCOPE,
        );
        span.setAttribute('entries_affected', r.total_changes ?? 0);
        return r;
      },
    );

    return asMcpResponse('meditate', result, args);
  },
);

server.tool(
  'compile',
  'Regenerate the wiki view of memory — synthesize tier or topic markdown from pgvector. Output to memory/compiled/. Modes: tier (single tier), all (three tiers), topic (per-topic page), dry_run (preview to stdout). Response includes a next_tools[] array of {name, usage, why} suggested follow-ups (may be empty).',
  {
    tier: z.enum(['preferences', 'project-context', 'conversations']).optional(),
    all: z.boolean().optional(),
    topic: z.string().optional(),
    dry_run: z.boolean().optional(),
    max_cost_usd: z.number().optional(),
    provider: z.enum(['claude-code', 'anthropic', 'openrouter']).optional(),
  },
  async (args) => {
    const result = await withToolSpan(
      'compile',
      {
        scope: args.tier ?? args.topic ?? (args.all ? 'all' : 'unknown'),
        dry_run: args.dry_run ?? false,
      },
      async (span) => {
        const r = await compile(
          {
            tier: args.tier,
            all: args.all,
            topic: args.topic,
            dry_run: args.dry_run,
            max_cost_usd: args.max_cost_usd,
            provider: args.provider,
          },
          { cwd: PROJECT_ROOT },
        );
        span.setAttribute('files_written', r.files_written.length);
        span.setAttribute('hit_cost_cap', r.hit_cost_cap);
        span.setAttribute('provider', r.provider);
        return r;
      },
    );

    return asMcpResponse('compile', result, args);
  },
);

server.tool(
  'classify',
  'Classify candidate memory pairs into typed edges (supports, contradicts, supersedes, evolved_into, depends_on, related_to). Wraps the SPEC-043 edge classifier with cost cap and provider auto-fallback. Subprocess-spawned per the MCP-server-makes-no-LLM-calls invariant. Response includes a next_tools[] array of {name, usage, why} suggested follow-ups (may be empty).',
  {
    since_days: z
      .number()
      .optional()
      .describe('Filter candidate pairs to memories updated in the last N days'),
    max_cost_usd: z
      .number()
      .optional()
      .describe('Per-run cost cap in USD; default $1.00 from R2MCP_EDGE_MAX_USD'),
    dry_run: z.boolean().optional().describe('Estimate-only — no edges written'),
    resume_run_id: z
      .string()
      .optional()
      .describe('Resume a prior run_id; terminal pairs not re-classified'),
    provider: z
      .enum(['claude-code', 'anthropic', 'openrouter'])
      .optional()
      .describe('Force a specific provider for this run'),
  },
  async (args) => {
    const result = await withToolSpan(
      'classify',
      {
        since_days: args.since_days ?? 0,
        provider: args.provider ?? 'auto',
      },
      async (span) => {
        const r = await classify(
          {
            since_days: args.since_days,
            max_cost_usd: args.max_cost_usd,
            dry_run: args.dry_run,
            resume_run_id: args.resume_run_id,
            provider: args.provider,
          },
          { cwd: PROJECT_ROOT },
        );
        span.setAttribute('edges_written', r.edges_written);
        span.setAttribute('total_cost_usd', r.total_cost_usd);
        span.setAttribute('hit_cost_cap', r.hit_cost_cap);
        return r;
      },
    );
    return asMcpResponse('classify', result, args);
  },
);

server.tool(
  'extract_entities',
  'Extract structured entities (project / person / tool / decision) from memories. Spawns a subprocess driver that uses LLMProvider (Haiku-class). Inherits cost cap, resumable runs, and candidate pre-filtering from SPEC-043 patterns. Response includes a next_tools[] array of {name, usage, why} suggested follow-ups (may be empty).',
  {
    since_days: z
      .number()
      .int()
      .min(0)
      .optional()
      .describe('Filter candidate memories to those updated in the last N days'),
    max_cost_usd: z
      .number()
      .nonnegative()
      .optional()
      .describe('Per-run cost cap in USD; default $1.00 from R2MCP_ENTITY_MAX_USD'),
    provider: z
      .enum(['claude-code', 'anthropic', 'openrouter'])
      .optional()
      .describe('Force a specific provider for this run'),
    resume: z
      .string()
      .uuid()
      .optional()
      .describe('Resume a prior run_id; memories already terminal in that run are skipped'),
    full: z
      .boolean()
      .optional()
      .describe(
        'Backfill mode — process all memories regardless of recency. Mutually exclusive with since_days.',
      ),
    context_top_n: z
      .number()
      .int()
      .positive()
      .optional()
      .describe('Top-N existing entities to include in extraction context'),
  },
  async (args) => {
    const result = await withToolSpan(
      'extract_entities',
      {
        since_days: args.since_days ?? 0,
        provider: args.provider ?? 'auto',
        full: args.full ?? false,
      },
      async (span) => {
        const r = await extractEntitiesTool(
          {
            since_days: args.since_days,
            max_cost_usd: args.max_cost_usd,
            provider: args.provider,
            resume: args.resume,
            full: args.full,
            context_top_n: args.context_top_n,
          },
          { cwd: PROJECT_ROOT },
        );
        span.setAttribute('memories_seen', r.memories_seen);
        span.setAttribute('memories_extracted', r.memories_extracted);
        span.setAttribute('entities_created', r.entities_created);
        span.setAttribute('entities_updated', r.entities_updated);
        span.setAttribute('links_created', r.links_created);
        span.setAttribute('total_cost_usd', r.total_cost_usd);
        span.setAttribute('hit_cost_cap', r.hit_cost_cap);
        return r;
      },
    );
    return asMcpResponse('extract_entities', result, args);
  },
);

server.tool(
  'dump_edges_sidecar',
  'Write memory_edges and memories as JSON sidecar files for downstream consumers (Memory Explorer, /memory-doctor, etc.). In-process pgvector dump — no subprocess, no LLM calls. Response includes a next_tools[] array of {name, usage, why} suggested follow-ups (may be empty).',
  {
    out_dir: z
      .string()
      .describe('Absolute path to the directory where edges.json + memories.json land. Required.'),
    all_scopes: z
      .boolean()
      .optional()
      .describe('claw-z8k8: dump ALL project scopes (default: current scope + global).'),
  },
  async (args) => {
    const result = await withToolSpan(
      'dump_edges_sidecar',
      {
        out_dir: args.out_dir,
        all_scopes: args.all_scopes ?? false,
      },
      async (span) => {
        const r = await dumpEdgesSidecarTool({
          out_dir: args.out_dir,
          all_scopes: args.all_scopes,
        });
        span.setAttribute('memories_count', r.memories_count);
        span.setAttribute('edges_count', r.edges_count);
        return r;
      },
    );
    return asMcpResponse('dump_edges_sidecar', result, args);
  },
);

server.tool(
  'lint',
  'Surface structural feedback on the memory store: contradictions, stale, orphans, drift, superseded_unflagged. SQL-only (no LLM calls). Pass `fix: true` to apply auto-fixes for findings with confidence >= 0.9. Response includes a next_tools[] array of {name, usage, why} suggested follow-ups (may be empty).',
  {
    check: z
      .enum(['contradictions', 'stale', 'orphans', 'drift', 'superseded_unflagged'])
      .optional(),
    since_days: z.number().optional(),
    limit: z.number().optional(),
    fix: z.boolean().optional(),
    memory_id: z
      .string()
      .uuid()
      .optional()
      .describe(
        'SPEC-047: scope `contradictions` to edges where either endpoint matches this memory id. Ignored by other checks.',
      ),
  },
  async (args) => {
    const result = await withToolSpan(
      'lint',
      {
        check: args.check ?? 'all',
        fix: args.fix ?? false,
      },
      async (span) => {
        const r = await lint({
          check: args.check,
          since_days: args.since_days,
          limit: args.limit,
          fix: args.fix,
          memory_id: args.memory_id,
        });
        span.setAttribute('total_findings', r.summary.total_findings);
        span.setAttribute('fixes_applied', r.fixes_applied?.length ?? 0);
        return r;
      },
    );

    return asMcpResponse('lint', result, args);
  },
);

/**
 * Exit when the parent client disconnects.
 *
 * MCP transport is stdio — the parent (Claude Code, Slack bot, etc.) owns
 * this subprocess via a private pipe. When the parent exits cleanly it
 * sends SIGTERM and we never reach this path. When the parent crashes
 * (force-quit, SSH disconnect, kernel OOM), the pipe closes silently and
 * we'd otherwise sit forever waiting for input that never comes —
 * holding a Postgres connection slot for nothing.
 *
 * Watching `stdin` for `end` (EOF) catches both clean and crashed parents.
 * Watching `stdout` for EPIPE covers the rarer "we tried to write back
 * after the parent disappeared" case.
 */
function wireParentDisconnectHandlers(): void {
  const exit = (reason: string) => {
    console.error(`r2mcp exiting: ${reason}`);
    process.exit(0);
  };
  process.stdin.on('end', () => exit('parent disconnected (stdin EOF)'));
  process.stdin.on('close', () => exit('parent disconnected (stdin closed)'));
  process.stdout.on('error', (err: NodeJS.ErrnoException) => {
    if (err.code === 'EPIPE') exit('parent disconnected (stdout EPIPE)');
  });
}

async function main() {
  await initDb();
  console.error(`[r2mcp] project scope: ${CURRENT_SCOPE}`);
  if (!process.env.R2MCP_OPENROUTER_API_KEY) {
    console.error(`[r2mcp] ${EMBEDDINGS_DISABLED_WARNING}`);
  }
  const transport = new StdioServerTransport();
  await server.connect(transport);
  wireParentDisconnectHandlers();
  console.error('r2mcp running on stdio');
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
