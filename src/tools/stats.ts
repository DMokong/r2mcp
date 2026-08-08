import { getPool } from '../db.js';
import { currentScope } from '../env.js';
import { scopeClause } from './recall.js';

export interface StatsInput {
  /** claw-tsgd: report a SPECIFIC scope (+ global) instead of the env's current scope. */
  scope?: string;
  /** claw-tsgd: when true, aggregate across ALL project scopes (pre-0.3.1 behavior). */
  all_scopes?: boolean;
}

export interface StatsResult {
  total: number;
  by_tier: {
    preferences: number;
    'project-context': number;
    conversations: number;
  };
  by_type: {
    preference: number;
    decision: number;
    context: number;
    relationship: number;
    observation: number;
    rejection: number;
  };
  staleness: {
    oldest_entry: string | null;
    avg_age_days: number;
  };
  top_topics: Array<{ topic: string; count: number }>;
  index: {
    entries_with_embeddings: number;
    entries_without_embeddings: number;
    model: 'openai/text-embedding-3-small';
    last_write: string | null;
  };
}

export async function stats(input: StatsInput = {}): Promise<StatsResult> {
  const pool = getPool();

  // claw-tsgd: default to the env's scope + global, mirroring recall(). Every
  // query below shares this one predicate and params array — a bare
  // `FROM memories` here silently reports another project's corpus.
  const scopes = input.all_scopes ? null : [input.scope ?? currentScope(), 'global'];
  const params: unknown[] = [];
  const where = scopes === null ? '' : `WHERE true${scopeClause('', params, scopes)}`;

  // Run all queries in parallel
  const [
    totalResult,
    tierResult,
    typeResult,
    stalenessResult,
    topicsResult,
    embeddingResult,
    lastWriteResult,
  ] = await Promise.all([
    // Total count
    pool.query(`SELECT COUNT(*)::int AS total FROM memories ${where}`, params),

    // By tier
    pool.query(
      `SELECT tier, COUNT(*)::int AS count
       FROM memories ${where}
       GROUP BY tier`,
      params,
    ),

    // By type
    pool.query(
      `SELECT type, COUNT(*)::int AS count
       FROM memories ${where}
       GROUP BY type`,
      params,
    ),

    // Staleness
    pool.query(
      `SELECT
         MIN(created_at) AS oldest_entry,
         COALESCE(EXTRACT(EPOCH FROM AVG(NOW() - created_at)) / 86400, 0) AS avg_age_days
       FROM memories ${where}`,
      params,
    ),

    // Top topics (unnest topics array and count). The scope filter has to run
    // on memories BEFORE the unnest join, hence the subquery.
    pool.query(
      `SELECT topic, COUNT(*)::int AS count
       FROM (SELECT topics FROM memories ${where}) m, unnest(m.topics) AS topic
       GROUP BY topic
       ORDER BY count DESC
       LIMIT 10`,
      params,
    ),

    // Embedding counts
    pool.query(
      `SELECT
         COUNT(*) FILTER (WHERE embedding IS NOT NULL)::int AS with_embeddings,
         COUNT(*) FILTER (WHERE embedding IS NULL)::int AS without_embeddings
       FROM memories ${where}`,
      params,
    ),

    // Last write
    pool.query(`SELECT MAX(updated_at) AS last_write FROM memories ${where}`, params),
  ]);

  // Build tier map
  const tierMap: Record<string, number> = {};
  for (const row of tierResult.rows) {
    tierMap[row.tier] = row.count;
  }

  // Build type map
  const typeMap: Record<string, number> = {};
  for (const row of typeResult.rows) {
    typeMap[row.type] = row.count;
  }

  const stalenessRow = stalenessResult.rows[0];
  const embeddingRow = embeddingResult.rows[0];
  const lastWriteRow = lastWriteResult.rows[0];

  return {
    total: totalResult.rows[0].total,
    by_tier: {
      preferences: tierMap['preferences'] || 0,
      'project-context': tierMap['project-context'] || 0,
      conversations: tierMap['conversations'] || 0,
    },
    by_type: {
      preference: typeMap['preference'] || 0,
      decision: typeMap['decision'] || 0,
      context: typeMap['context'] || 0,
      relationship: typeMap['relationship'] || 0,
      observation: typeMap['observation'] || 0,
      rejection: typeMap['rejection'] || 0,
    },
    staleness: {
      oldest_entry: stalenessRow.oldest_entry ? stalenessRow.oldest_entry.toISOString() : null,
      avg_age_days: Math.round(parseFloat(stalenessRow.avg_age_days) * 100) / 100,
    },
    top_topics: topicsResult.rows.map((row) => ({
      topic: row.topic,
      count: row.count,
    })),
    index: {
      entries_with_embeddings: embeddingRow.with_embeddings,
      entries_without_embeddings: embeddingRow.without_embeddings,
      model: 'openai/text-embedding-3-small',
      last_write: lastWriteRow.last_write ? lastWriteRow.last_write.toISOString() : null,
    },
  };
}
