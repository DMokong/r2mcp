import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { stats } from '../tools/stats.js';
import { withToolSpan } from '../telemetry.js';
import { asMcpResponse } from '../mcp-response.js';
import type { ToolContext } from './types.js';

const DESCRIPTION =
  'Get system health statistics for r2mcp memory — counts by tier/type, staleness, top topics, embedding index status. Scope-confined to the current scope + global by default. Response includes a next_tools[] array of {name, usage, why} suggested follow-ups (may be empty).';

export function registerStats(server: McpServer, ctx: ToolContext): void {
  server.tool(
    'stats',
    ctx.description ?? DESCRIPTION,
    {
      scope: z
        .string()
        .optional()
        .describe(
          'claw-tsgd: report a specific project scope (+ global) instead of the server scope.',
        ),
      all_scopes: z
        .boolean()
        .optional()
        .describe('claw-tsgd: aggregate across ALL project scopes.'),
    },
    async (args) => {
      const result = await withToolSpan(
        'stats',
        { all_scopes: args.all_scopes ?? false },
        async (span) => {
          const r = await stats({ scope: args.scope, all_scopes: args.all_scopes });
          span.setAttribute('total_entries', r.total ?? 0);
          return r;
        },
      );

      return asMcpResponse('stats', result, args);
    },
  );
}
