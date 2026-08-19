import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { search } from '../tools/search.js';
import { withToolSpan } from '../telemetry.js';
import { asMcpResponse } from '../mcp-response.js';
import type { ToolContext } from './types.js';

const DESCRIPTION =
  'Search memory using structured metadata filters (type, tier, topics, persons, date range) with optional full-text query. Response includes a next_tools[] array of {name, usage, why} suggested follow-ups (may be empty).';

export function registerSearch(server: McpServer, ctx: ToolContext): void {
  server.tool(
    'search',
    ctx.description ?? DESCRIPTION,
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
}
