import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { reject } from '../tools/reject.js';
import { withToolSpan } from '../telemetry.js';
import { asMcpResponse } from '../mcp-response.js';
import type { ToolContext } from './types.js';

const DESCRIPTION =
  'Mark an existing memory as rejected and store the rejection reason. Rejected memories are excluded from recall and search results. Response includes a next_tools[] array of {name, usage, why} suggested follow-ups (may be empty).';

export function registerReject(server: McpServer, ctx: ToolContext): void {
  server.tool(
    'reject',
    ctx.description ?? DESCRIPTION,
    {
      id: z.string(),
      reason: z.string(),
    },
    async (args) => {
      const result = await withToolSpan('reject', { target_id: args.id }, async () => {
        return reject({ id: args.id, reason: args.reason }, ctx.scope);
      });

      return asMcpResponse('reject', result, args);
    },
  );
}
