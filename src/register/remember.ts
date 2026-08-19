import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { remember } from '../tools/remember.js';
import { withToolSpan } from '../telemetry.js';
import { asMcpResponse } from '../mcp-response.js';
import type { RememberContext } from './types.js';

const DESCRIPTION =
  'Store, update, or archive a memory in the long-term memory system. Response includes a next_tools[] array of {name, usage, why} suggested follow-ups (may be empty).';

export function registerRemember(server: McpServer, ctx: RememberContext): void {
  server.tool(
    'remember',
    ctx.description ?? DESCRIPTION,
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
            args.scope ?? ctx.scope,
          );
          // SPEC-059 parity: this replaces the three in-tool triggerGraphRebuild
          // call sites that used to live in src/tools/remember.ts (lines 104,
          // 159, 213 pre-change). Those fired after a successful ADD/REJECTION
          // insert, a successful UPDATE, and a successful ARCHIVE. Every
          // non-firing return path (NOOP, missing/unmatched target_id,
          // unknown operation) returns no `id`; the dedup path is the one
          // return that carries an `id` without having written new content, and
          // it is the only one that sets `dedup: true` — hence the guard.
          if (r.id && !r.dedup) ctx.afterWrite?.();
          span.setAttribute('dedup_triggered', r.dedup ?? false);
          return r;
        },
      );

      return asMcpResponse('remember', result, args);
    },
  );
}
