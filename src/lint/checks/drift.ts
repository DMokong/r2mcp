import type { LintFinding } from '../types.js';
import type { PoolLike } from './contradictions.js';

/**
 * Drift: candidate pairs that look like they SHOULD have a structural edge
 * but don't yet. Heuristic: pairs sharing ≥2 topics, time gap > 30 days, no
 * edge of any type, neither archived. Surfaces classification gaps —
 * memories the classifier hasn't yet inspected.
 *
 * Distinct from `superseded_unflagged`:
 *   - drift: NO edge yet between the pair (classifier hasn't run on this pair)
 *   - superseded_unflagged: contradicts edge exists, but its TYPE is wrong
 *
 * Confidence is 0.55 — purely heuristic. Below the auto-fix threshold;
 * suggested action is always `reclassify` (run the classifier on this pair).
 */

interface DriftRow {
  newer_id: string;
  older_id: string;
  shared_topics: number;
}

const DRIFT_SQL = `
  SELECT
    m1.id AS newer_id,
    m2.id AS older_id,
    (
      SELECT COUNT(*)::int FROM unnest(m1.topics) t1
      WHERE t1 = ANY(m2.topics)
    ) AS shared_topics
  FROM memories m1
  JOIN memories m2 ON m1.created_at > m2.created_at + INTERVAL '30 days'
  WHERE m1.type != 'archived' AND m2.type != 'archived'
    AND (
      SELECT COUNT(*) FROM unnest(m1.topics) t1
      WHERE t1 = ANY(m2.topics)
    ) >= 2
    AND NOT EXISTS (
      SELECT 1 FROM memory_edges e
      WHERE (e.from_memory_id = m1.id AND e.to_memory_id = m2.id)
         OR (e.from_memory_id = m2.id AND e.to_memory_id = m1.id)
    )
  ORDER BY shared_topics DESC, m1.created_at DESC
  LIMIT $1
`;

export async function findDrift(pool: PoolLike, opts: { limit: number }): Promise<LintFinding[]> {
  const rows = await pool.query<DriftRow>(DRIFT_SQL, [opts.limit]);
  return rows.rows.map((r) => ({
    check: 'drift',
    memory_id: r.newer_id,
    related_memory_id: r.older_id,
    rationale: `Pair shares ${r.shared_topics} topics with >30d gap and no classifier-written edge — possible classification gap.`,
    suggested_action: 'reclassify',
    confidence: 0.55,
  }));
}
