import type pg from 'pg';
import { currentScope } from '../env.js';

export interface CandidatePair {
  from_id: string;
  to_id: string;
  shared_topics: string[];
  shared_people: string[];
}

export interface CandidateOptions {
  sinceDays?: number;
  /** claw-nyxd: only pair memories within this project scope (no cross-project edges). */
  scope?: string;
}

/**
 * Find candidate memory pairs eligible for edge classification (spec R5).
 *
 * Eligibility:
 *   - share >=2 topics, OR
 *   - share >=1 person
 *
 * Returns each unordered pair once (using id order to deduplicate).
 * Excludes self-pairs.
 *
 * If `sinceDays` is set, at least one memory in the pair must have been
 * created within that window — used by --since to limit incremental runs.
 */
export async function findCandidatePairs(
  pool: pg.Pool,
  opts: CandidateOptions,
): Promise<CandidatePair[]> {
  const params: unknown[] = [opts.scope ?? currentScope()];
  const sinceClause = opts.sinceDays
    ? `AND (m1.created_at >= NOW() - ($2 || ' days')::interval
            OR m2.created_at >= NOW() - ($2 || ' days')::interval)`
    : '';
  if (opts.sinceDays) params.push(String(opts.sinceDays));

  const sql = `
    SELECT m1.id AS from_id, m2.id AS to_id,
           ARRAY(SELECT unnest(m1.topics) INTERSECT SELECT unnest(m2.topics)) AS shared_topics,
           ARRAY(SELECT unnest(m1.people) INTERSECT SELECT unnest(m2.people)) AS shared_people
    FROM memories m1
    JOIN memories m2
      ON m1.id < m2.id
     AND (
           cardinality(ARRAY(SELECT unnest(m1.topics) INTERSECT SELECT unnest(m2.topics))) >= 2
           OR cardinality(ARRAY(SELECT unnest(m1.people) INTERSECT SELECT unnest(m2.people))) >= 1
         )
    WHERE m1.project_scope = $1 AND m2.project_scope = $1 ${sinceClause}
  `;
  const res = await pool.query<CandidatePair>(sql, params);
  return res.rows;
}
