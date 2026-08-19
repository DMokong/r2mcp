import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { recall } from '../tools/recall.js';
import { withToolSpan } from '../telemetry.js';
import { asMcpResponse } from '../mcp-response.js';
import type { ToolContext } from './types.js';

const DESCRIPTION =
  'Search memory using semantic similarity and full-text search. Supports progressive tier search, MMR diversity, relevance floor, and token-budget-based retrieval. Response includes a next_tools[] array of {name, usage, why} suggested follow-ups (may be empty).';

export function registerRecall(server: McpServer, ctx: ToolContext): void {
  server.tool(
    'recall',
    ctx.description ?? DESCRIPTION,
    {
      query: z
        .string()
        .optional()
        .default('')
        .describe(
          'Free-text query. Optional when `entity` is provided — SPEC-046 entity-only recall short-circuits without a query.',
        ),
      top_k: z.number().optional().default(10),
      tier: z.enum(['preferences', 'project-context', 'conversations']).optional(),
      max_tokens: z
        .number()
        .optional()
        .describe('Token budget — return results until budget is exhausted'),
      min_score: z
        .number()
        .optional()
        .describe(
          'Minimum relevance score threshold (default: 0.0). Suggested: 0.3 for semantic, 0.1 for fulltext.',
        ),
      diversity: z
        .number()
        .min(0)
        .max(1)
        .optional()
        .describe('MMR lambda: 1.0 = pure relevance, 0.0 = pure diversity (default: 0.7)'),
      progressive: z
        .boolean()
        .optional()
        .describe(
          'Search tiers top-down, stopping early when high-confidence results found (default: true)',
        ),
      confidence_threshold: z
        .number()
        .optional()
        .describe('Raw score threshold for progressive early-stop (default: 0.82)'),
      entity: z
        .string()
        .optional()
        .describe(
          'SPEC-046: filter results to memories linked to this entity (canonical_name or alias; case-insensitive). When set, response adds entity_resolved/entity_id and per-result entity_links.',
        ),
      all_scopes: z
        .boolean()
        .optional()
        .describe(
          'Search across ALL project scopes instead of the current scope + global (default: false).',
        ),
      scope: z
        .string()
        .optional()
        .describe(
          'Read a SPECIFIC project scope (+ global) instead of the server scope — e.g. "ai-landscape" to read that wiki corpus. Ignored when all_scopes is true.',
        ),
    },
    async (args) => {
      const queryStr = args.query ?? '';
      const result = await withToolSpan(
        'recall',
        {
          query_length: queryStr.length,
          tier: args.tier || 'all',
          top_k: args.top_k,
          progressive: args.progressive ?? true,
          entity: args.entity ?? '',
        },
        async (span) => {
          const r = await recall({
            query: queryStr,
            top_k: args.top_k,
            tier: args.tier,
            max_tokens: args.max_tokens,
            min_score: args.min_score,
            diversity: args.diversity,
            progressive: args.progressive,
            confidence_threshold: args.confidence_threshold,
            entity: args.entity,
            all_scopes: args.all_scopes,
            scope: args.scope,
          });
          span.setAttribute('result_count', r.results.length);
          span.setAttribute('search_mode', r.search_mode ?? 'unknown');
          span.setAttribute('early_stopped', r.early_stopped ?? false);
          span.setAttribute('tiers_searched', (r.tiers_searched ?? []).join(','));
          span.setAttribute('tokens_used', r.tokens_used ?? 0);
          return r;
        },
      );

      return asMcpResponse('recall', result, args);
    },
  );
}
