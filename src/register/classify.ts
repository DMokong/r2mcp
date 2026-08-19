import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { classify } from '../tools/classify.js';
import { withToolSpan } from '../telemetry.js';
import { asMcpResponse } from '../mcp-response.js';
import type { ProjectToolContext } from './types.js';

const DESCRIPTION =
  'Classify candidate memory pairs into typed edges (supports, contradicts, supersedes, evolved_into, depends_on, related_to). Wraps the SPEC-043 edge classifier with cost cap and provider auto-fallback. Subprocess-spawned per the MCP-server-makes-no-LLM-calls invariant. Response includes a next_tools[] array of {name, usage, why} suggested follow-ups (may be empty).';

export function registerClassify(server: McpServer, ctx: ProjectToolContext): void {
  server.tool(
    'classify',
    ctx.description ?? DESCRIPTION,
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
            { cwd: ctx.projectRoot },
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
}
