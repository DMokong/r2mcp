import type { LintFinding } from '../types.js';
import { currentScope } from '../../env.js';

/**
 * Contradictions: rows where `relation='contradicts'`, both endpoints are
 * unarchived, and the edge is currently valid (`valid_until IS NULL`).
 *
 * The edge already carries `confidence` and `rationale` from the classifier;
 * we surface those directly.
 *
 * `suggested_action` routes the finding:
 *   - if the from-side is strictly newer than the to-side → `add_supersedes_edge`
 *     (the contradicts edge probably should have been supersedes)
 *   - if confidence >= 0.85 and the contents look factual → `archive_one`
 *   - otherwise → `human_review`
 *
 * SPEC-047 additions:
 *   - Surface the from-side's first topic as `topic` so the lint→compile
 *     breadcrumb (`compile --topic=<t>`) can emit without a second query.
 *   - Accept an optional `memoryId` filter so the recall→lint breadcrumb
 *     (`lint --check=contradictions --memory-id=<id>`) can scope to a single
 *     memory (matches either endpoint of the edge).
 */

export interface PoolLike {
  query<T = unknown>(
    sql: string,
    params?: unknown[],
  ): Promise<{ rows: T[]; rowCount?: number | null }>;
}

interface ContradictionRow {
  from_id: string;
  to_id: string;
  confidence: number;
  rationale: string;
  from_created_at: string;
  to_created_at: string;
  from_topics: string[] | null;
}

const BASE_SQL = `
  SELECT
    e.from_memory_id  AS from_id,
    e.to_memory_id    AS to_id,
    e.confidence::float AS confidence,
    e.rationale       AS rationale,
    m1.created_at::text AS from_created_at,
    m2.created_at::text AS to_created_at,
    m1.topics         AS from_topics
  FROM memory_edges e
  JOIN memories m1 ON m1.id = e.from_memory_id
  JOIN memories m2 ON m2.id = e.to_memory_id
  WHERE e.relation = 'contradicts'
    AND e.valid_until IS NULL
    AND m1.type != 'archived'
    AND m2.type != 'archived'`;

export async function findContradictions(
  pool: PoolLike,
  opts: { limit: number; memoryId?: string; scope?: string },
): Promise<LintFinding[]> {
  const params: unknown[] = [];
  let filters = '';
  if (opts.memoryId) {
    params.push(opts.memoryId);
    filters += ` AND (e.from_memory_id = $${params.length} OR e.to_memory_id = $${params.length})`;
  }
  // claw-nyxd: both endpoints must be in the current scope.
  params.push(opts.scope ?? currentScope());
  filters += ` AND m1.project_scope = $${params.length} AND m2.project_scope = $${params.length}`;
  params.push(opts.limit);
  const query = `${BASE_SQL}${filters}\n  ORDER BY e.confidence DESC\n  LIMIT $${params.length}`;

  const rows = await pool.query<ContradictionRow>(query, params);
  return rows.rows.map((r) => {
    const fromIsNewer = r.from_created_at > r.to_created_at;
    let action: LintFinding['suggested_action'];
    if (fromIsNewer && r.confidence >= 0.7) {
      action = 'add_supersedes_edge';
    } else if (r.confidence >= 0.85) {
      action = 'archive_one';
    } else {
      action = 'human_review';
    }
    const topic =
      Array.isArray(r.from_topics) && r.from_topics.length > 0 ? r.from_topics[0] : undefined;
    return {
      check: 'contradictions',
      memory_id: r.from_id,
      related_memory_id: r.to_id,
      topic,
      rationale: r.rationale,
      suggested_action: action,
      confidence: r.confidence,
    };
  });
}
