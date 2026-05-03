import type { LintFinding } from '../types.js';
import type { PoolLike } from './contradictions.js';

/**
 * Orphans: memories with zero edges in either direction, older than 30 days,
 * not archived. They might be truly isolated insights worth keeping, or they
 * might be low-signal noise. Lint surfaces them as suggestions; never auto-acts.
 *
 * Confidence is intentionally moderate (0.6) — we can't tell from SQL alone
 * whether an unconnected memory is a deliberate isolated insight or noise.
 * This is a deliberate "below the auto-fix threshold" finding (C.R3).
 */

interface OrphanRow {
  id: string;
  created_at: string;
}

const ORPHANS_SQL = `
  SELECT
    m.id,
    m.created_at::text AS created_at
  FROM memories m
  WHERE m.type != 'archived'
    AND m.created_at < NOW() - INTERVAL '30 days'
    AND NOT EXISTS (
      SELECT 1 FROM memory_edges e
      WHERE (e.from_memory_id = m.id OR e.to_memory_id = m.id)
        AND e.valid_until IS NULL
    )
  ORDER BY m.created_at ASC
  LIMIT $1
`;

export async function findOrphans(
  pool: PoolLike,
  opts: { limit: number },
): Promise<LintFinding[]> {
  const rows = await pool.query<OrphanRow>(ORPHANS_SQL, [opts.limit]);
  return rows.rows.map((r) => ({
    check: 'orphans',
    memory_id: r.id,
    rationale: `Memory has no edges in either direction since ${r.created_at}.`,
    suggested_action: 'human_review',
    confidence: 0.6,
  }));
}
