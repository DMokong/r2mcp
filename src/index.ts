// OTel instrumentation MUST be imported first — before any other module
import './instrumentation.js';

import { readFileSync, existsSync } from 'node:fs';
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
import { withToolSpan } from './telemetry.js';

// Load .env from project root — MCP servers don't inherit parent env vars
const PROJECT_ROOT = process.env.PROJECT_ROOT || process.cwd();
const envPath = resolve(PROJECT_ROOT, '.env');
if (existsSync(envPath)) {
  const envContent = readFileSync(envPath, 'utf-8');
  for (const line of envContent.split('\n')) {
    const match = line.match(/^([A-Z_]+)=(.+)$/);
    if (match && !process.env[match[1]]) {
      process.env[match[1]] = match[2].trim();
    }
  }
}

const server = new McpServer({
  name: 'r2mcp',
  version: '0.1.0',
});

server.tool(
  'remember',
  'Store, update, or archive a memory in the long-term memory system.',
  {
    operation: z.enum(['ADD', 'UPDATE', 'ARCHIVE', 'REJECTION', 'NOOP']),
    tier: z.enum(['preferences', 'project-context', 'conversations']),
    content: z.string(),
    metadata: z.object({
      type: z.enum(['preference', 'decision', 'context', 'relationship', 'observation', 'rejection']),
      topics: z.array(z.string()).optional(),
      people: z.array(z.string()).optional(),
      section: z.string().optional(),
      date: z.string().optional(),
    }),
    target_id: z.string().optional(),
  },
  async (args) => {
    const result = await withToolSpan('remember', {
      operation: args.operation,
      tier: args.tier,
    }, async (span) => {
      const r = await remember(
        {
          operation: args.operation,
          tier: args.tier,
          content: args.content,
          metadata: args.metadata,
          target_id: args.target_id,
        },
        PROJECT_ROOT
      );
      span.setAttribute('dedup_triggered', r.dedup ?? false);
      return r;
    });

    return {
      content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }],
    };
  }
);

server.tool(
  'recall',
  'Search memory using semantic similarity and full-text search. Supports progressive tier search, MMR diversity, relevance floor, and token-budget-based retrieval.',
  {
    query: z.string(),
    top_k: z.number().optional().default(10),
    tier: z.enum(['preferences', 'project-context', 'conversations']).optional(),
    max_tokens: z.number().optional().describe('Token budget — return results until budget is exhausted'),
    min_score: z.number().optional().describe('Minimum relevance score threshold (default: 0.0). Suggested: 0.3 for semantic, 0.1 for fulltext.'),
    diversity: z.number().min(0).max(1).optional().describe('MMR lambda: 1.0 = pure relevance, 0.0 = pure diversity (default: 0.7)'),
    progressive: z.boolean().optional().describe('Search tiers top-down, stopping early when high-confidence results found (default: true)'),
    confidence_threshold: z.number().optional().describe('Raw score threshold for progressive early-stop (default: 0.82)'),
  },
  async (args) => {
    const result = await withToolSpan('recall', {
      query_length: args.query.length,
      tier: args.tier || 'all',
      top_k: args.top_k,
      progressive: args.progressive ?? true,
    }, async (span) => {
      const r = await recall({
        query: args.query,
        top_k: args.top_k,
        tier: args.tier,
        max_tokens: args.max_tokens,
        min_score: args.min_score,
        diversity: args.diversity,
        progressive: args.progressive,
        confidence_threshold: args.confidence_threshold,
      });
      span.setAttribute('result_count', r.total_results ?? 0);
      span.setAttribute('search_mode', r.search_mode ?? 'unknown');
      span.setAttribute('early_stopped', r.early_stopped ?? false);
      span.setAttribute('tiers_searched', (r.tiers_searched ?? []).join(','));
      span.setAttribute('tokens_used', r.tokens_used ?? 0);
      return r;
    });

    return {
      content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }],
    };
  }
);

server.tool(
  'search',
  'Search memory using structured metadata filters (type, tier, topics, persons, date range) with optional full-text query.',
  {
    filter: z.object({
      type: z.string().optional(),
      tier: z.string().optional(),
      topics: z.array(z.string()).optional(),
      persons: z.array(z.string()).optional(),
      created_after: z.string().optional(),
      created_before: z.string().optional(),
    }).optional(),
    query: z.string().optional(),
    limit: z.number().optional(),
  },
  async (args) => {
    const result = await withToolSpan('search', {
      has_query: !!args.query,
      tier_filter: args.filter?.tier || 'all',
    }, async (span) => {
      const r = await search({
        filter: args.filter,
        query: args.query,
        limit: args.limit,
      });
      span.setAttribute('result_count', r.count ?? 0);
      return r;
    });

    return {
      content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }],
    };
  }
);

server.tool(
  'stats',
  'Get system health statistics for r2mcp memory — counts by tier/type, staleness, top topics, embedding index status.',
  {},
  async () => {
    const result = await withToolSpan('stats', {}, async (span) => {
      const r = await stats();
      span.setAttribute('total_entries', r.total ?? 0);
      return r;
    });

    return {
      content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }],
    };
  }
);

server.tool(
  'reject',
  'Mark an existing memory as rejected and store the rejection reason. Rejected memories are excluded from recall and search results.',
  {
    id: z.string(),
    reason: z.string(),
  },
  async (args) => {
    const result = await withToolSpan('reject', { target_id: args.id }, async () => {
      return reject({ id: args.id, reason: args.reason });
    });

    return {
      content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }],
    };
  }
);

server.tool(
  'meditate',
  'Run memory consolidation — archives stale entries, checks for duplicates, finds cross-references, clusters by theme, and surfaces gaps.',
  {
    mode: z.enum(['full']).default('full'),
    dry_run: z.boolean().optional().default(false),
  },
  async (args) => {
    const result = await withToolSpan('meditate', {
      mode: args.mode,
      dry_run: args.dry_run,
    }, async (span) => {
      const r = await meditate({ mode: args.mode, dry_run: args.dry_run }, PROJECT_ROOT);
      span.setAttribute('entries_affected', r.total_changes ?? 0);
      return r;
    });

    return {
      content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }],
    };
  }
);

server.tool(
  'compile',
  'Regenerate the wiki view of memory — synthesize tier or topic markdown from pgvector. Output to memory/compiled/. Modes: tier (single tier), all (three tiers), topic (per-topic page), dry_run (preview to stdout).',
  {
    tier: z.enum(['preferences', 'project-context', 'conversations']).optional(),
    all: z.boolean().optional(),
    topic: z.string().optional(),
    dry_run: z.boolean().optional(),
    max_cost_usd: z.number().optional(),
    provider: z.enum(['claude-code', 'anthropic', 'openrouter']).optional(),
  },
  async (args) => {
    const result = await withToolSpan('compile', {
      scope: args.tier ?? args.topic ?? (args.all ? 'all' : 'unknown'),
      dry_run: args.dry_run ?? false,
    }, async (span) => {
      const r = await compile({
        tier: args.tier,
        all: args.all,
        topic: args.topic,
        dry_run: args.dry_run,
        max_cost_usd: args.max_cost_usd,
        provider: args.provider,
      }, { cwd: PROJECT_ROOT });
      span.setAttribute('files_written', r.files_written.length);
      span.setAttribute('hit_cost_cap', r.hit_cost_cap);
      span.setAttribute('provider', r.provider);
      return r;
    });

    return {
      content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }],
    };
  }
);

async function main() {
  await initDb();
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('r2mcp running on stdio');
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
