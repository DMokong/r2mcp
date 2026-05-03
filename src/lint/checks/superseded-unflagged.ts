import type { LintFinding } from '../types.js';
import type { PoolLike } from './contradictions.js';

/**
 * superseded_unflagged: a pair has an existing `relation='contradicts'` edge,
 * but the temporal pattern (newer memory replaces older one on the same
 * topic) suggests the edge type itself is wrong — should be `supersedes`,
 * not `contradicts`.
 *
 * Distinct from `drift`:
 *   - drift: NO edge between pair, classifier hasn't run
 *   - superseded_unflagged: edge exists, but TYPE is wrong
 *
 * Confidence: 0.85 by default. Bumps to 0.9 when the from-side is strictly
 * newer AND there's significant topic overlap (≥1 shared topic, time gap
 * > 90 days). Threshold-passing findings are eligible for `lint --fix` to
 * rewrite the edge type (`fix_edge_type` action).
 */

interface SuperUnflaggedRow {
  edge_id: string;
  from_id: string;
  to_id: string;
  confidence: number;
  rationale: string;
  from_created_at: string;
  to_created_at: string;
  shared_topics: number;
}

const SUPER_UNFLAGGED_SQL = `
  SELECT
    e.id::text AS edge_id,
    e.from_memory_id AS from_id,
    e.to_memory_id   AS to_id,
    e.confidence::float AS confidence,
    e.rationale,
    m1.created_at::text AS from_created_at,
    m2.created_at::text AS to_created_at,
    (
      SELECT COUNT(*)::int FROM unnest(m1.topics) t1
      WHERE t1 = ANY(m2.topics)
    ) AS shared_topics
  FROM memory_edges e
  JOIN memories m1 ON m1.id = e.from_memory_id
  JOIN memories m2 ON m2.id = e.to_memory_id
  WHERE e.relation = 'contradicts'
    AND e.valid_until IS NULL
    AND m1.created_at > m2.created_at  -- from is strictly newer
    AND m1.type != 'archived'
    AND m2.type != 'archived'
  ORDER BY (m1.created_at - m2.created_at) DESC
  LIMIT $1
`;

export async function findSupersededUnflagged(
  pool: PoolLike,
  opts: { limit: number },
): Promise<LintFinding[]> {
  const rows = await pool.query<SuperUnflaggedRow>(SUPER_UNFLAGGED_SQL, [opts.limit]);
  const findings: LintFinding[] = [];
  for (const r of rows.rows) {
    const ageGapDays = ageDays(r.from_created_at, r.to_created_at);
    let confidence = 0.85;
    if (r.shared_topics >= 1 && ageGapDays >= 90) confidence = 0.92;
    findings.push({
      check: 'superseded_unflagged',
      memory_id: r.from_id,
      related_memory_id: r.to_id,
      rationale: `${r.from_id} contradicts ${r.to_id} but is ${ageGapDays}d newer with ${r.shared_topics} shared topics — likely supersedes, not contradicts.`,
      suggested_action: 'fix_edge_type',
      confidence,
    });
  }
  return findings;
}

function ageDays(newer: string, older: string): number {
  const ms = new Date(newer).getTime() - new Date(older).getTime();
  return Math.round(ms / (1000 * 60 * 60 * 24));
}
