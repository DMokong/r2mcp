import type { LintFinding } from '../types.js';
import type { PoolLike } from './contradictions.js';
import { currentScope } from '../../env.js';

/**
 * Stale memories: older than `since_days` (default 90), with zero incoming
 * edges, tier != 'preferences', not already archived. Preferences are exempt
 * because they're rarely "stale" — they're durable decisions.
 *
 * Confidence:
 *   - 0.95 if the memory ALSO has no outgoing edges (totally unconnected)
 *   - 0.7 if it has outgoing edges (referenced by older memories — context)
 *
 * Suggested action: `archive`. `lint --fix` will archive findings with
 * confidence >= 0.9 (C.AC4).
 */

interface StaleRow {
  id: string;
  created_at: string;
  has_outgoing: boolean;
}

const STALE_SQL = `
  SELECT
    m.id,
    m.created_at::text AS created_at,
    EXISTS (
      SELECT 1 FROM memory_edges oe
      WHERE oe.from_memory_id = m.id AND oe.valid_until IS NULL
    ) AS has_outgoing
  FROM memories m
  WHERE m.type != 'archived'
    AND m.tier != 'preferences'
    AND m.project_scope = $3
    AND m.created_at < NOW() - ($1 || ' days')::interval
    AND NOT EXISTS (
      SELECT 1 FROM memory_edges ie
      WHERE ie.to_memory_id = m.id AND ie.valid_until IS NULL
    )
  ORDER BY m.created_at ASC
  LIMIT $2
`;

export async function findStale(
  pool: PoolLike,
  opts: { sinceDays: number; limit: number; scope?: string },
): Promise<LintFinding[]> {
  const rows = await pool.query<StaleRow>(STALE_SQL, [
    opts.sinceDays,
    opts.limit,
    opts.scope ?? currentScope(),
  ]);
  return rows.rows.map((r) => ({
    check: 'stale',
    memory_id: r.id,
    rationale: `Memory created ${r.created_at} has no incoming edges${r.has_outgoing ? ' (but has outgoing references)' : ' or outgoing references'}.`,
    suggested_action: 'archive',
    confidence: r.has_outgoing ? 0.7 : 0.95,
  }));
}
