import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { compile } from '../tools/compile.js';
import { withToolSpan } from '../telemetry.js';
import { asMcpResponse } from '../mcp-response.js';
import type { ProjectToolContext } from './types.js';

const DESCRIPTION =
  'Regenerate the wiki view of memory — synthesize tier or topic markdown from pgvector. Output to memory/compiled/. Modes: tier (single tier), all (three tiers), topic (per-topic page), dry_run (preview to stdout). Response includes a next_tools[] array of {name, usage, why} suggested follow-ups (may be empty).';

export function registerCompile(server: McpServer, ctx: ProjectToolContext): void {
  server.tool(
    'compile',
    ctx.description ?? DESCRIPTION,
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
            { cwd: ctx.projectRoot },
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
}
