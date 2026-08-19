import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { meditate } from '../tools/meditate.js';
import { withToolSpan } from '../telemetry.js';
import { asMcpResponse } from '../mcp-response.js';
import type { ProjectToolContext } from './types.js';

const DESCRIPTION =
  'Run memory consolidation — archives stale entries, checks for duplicates, finds cross-references, clusters by theme, and surfaces gaps. Response includes a next_tools[] array of {name, usage, why} suggested follow-ups (may be empty).';

export function registerMeditate(server: McpServer, ctx: ProjectToolContext): void {
  server.tool(
    'meditate',
    ctx.description ?? DESCRIPTION,
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
            ctx.projectRoot,
            ctx.scope,
          );
          span.setAttribute('entries_affected', r.total_changes ?? 0);
          return r;
        },
      );

      return asMcpResponse('meditate', result, args);
    },
  );
}
