import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { extractEntitiesTool } from '../tools/extract-entities.js';
import { withToolSpan } from '../telemetry.js';
import { asMcpResponse } from '../mcp-response.js';
import type { ProjectToolContext } from './types.js';

const DESCRIPTION =
  'Extract structured entities (project / person / tool / decision) from memories. Spawns a subprocess driver that uses LLMProvider (Haiku-class). Inherits cost cap, resumable runs, and candidate pre-filtering from SPEC-043 patterns. Response includes a next_tools[] array of {name, usage, why} suggested follow-ups (may be empty).';

export function registerExtractEntities(server: McpServer, ctx: ProjectToolContext): void {
  server.tool(
    'extract_entities',
    ctx.description ?? DESCRIPTION,
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
            { cwd: ctx.projectRoot },
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
}
