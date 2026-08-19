import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { lint } from '../tools/lint.js';
import { withToolSpan } from '../telemetry.js';
import { asMcpResponse } from '../mcp-response.js';
import type { ToolContext } from './types.js';

const DESCRIPTION =
  'Surface structural feedback on the memory store: contradictions, stale, orphans, drift, superseded_unflagged. SQL-only (no LLM calls). Pass `fix: true` to apply auto-fixes for findings with confidence >= 0.9. Response includes a next_tools[] array of {name, usage, why} suggested follow-ups (may be empty).';

export function registerLint(server: McpServer, ctx: ToolContext): void {
  server.tool(
    'lint',
    ctx.description ?? DESCRIPTION,
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
}
