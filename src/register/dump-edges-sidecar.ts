import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { dumpEdgesSidecarTool } from '../tools/dump-edges-sidecar.js';
import { withToolSpan } from '../telemetry.js';
import { asMcpResponse } from '../mcp-response.js';
import type { ToolContext } from './types.js';

const DESCRIPTION =
  'Write memory_edges and memories as JSON sidecar files for downstream consumers (Memory Explorer, /memory-doctor, etc.). In-process pgvector dump — no subprocess, no LLM calls. Response includes a next_tools[] array of {name, usage, why} suggested follow-ups (may be empty).';

export function registerDumpEdgesSidecar(server: McpServer, ctx: ToolContext): void {
  server.tool(
    'dump_edges_sidecar',
    ctx.description ?? DESCRIPTION,
    {
      out_dir: z
        .string()
        .describe(
          'Absolute path to the directory where edges.json + memories.json land. Required.',
        ),
      all_scopes: z
        .boolean()
        .optional()
        .describe('claw-z8k8: dump ALL project scopes (default: current scope + global).'),
    },
    async (args) => {
      const result = await withToolSpan(
        'dump_edges_sidecar',
        {
          out_dir: args.out_dir,
          all_scopes: args.all_scopes ?? false,
        },
        async (span) => {
          const r = await dumpEdgesSidecarTool({
            out_dir: args.out_dir,
            all_scopes: args.all_scopes,
          });
          span.setAttribute('memories_count', r.memories_count);
          span.setAttribute('edges_count', r.edges_count);
          return r;
        },
      );
      return asMcpResponse('dump_edges_sidecar', result, args);
    },
  );
}
