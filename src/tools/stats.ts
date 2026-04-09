import { getPool } from '../db.js';

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

export async function stats(): Promise<StatsResult> {
  const pool = getPool();

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
    pool.query('SELECT COUNT(*)::int AS total FROM memories'),

    // By tier
    pool.query(`
      SELECT tier, COUNT(*)::int AS count
      FROM memories
      GROUP BY tier
    `),

    // By type
    pool.query(`
      SELECT type, COUNT(*)::int AS count
      FROM memories
      GROUP BY type
    `),

    // Staleness
    pool.query(`
      SELECT
        MIN(created_at) AS oldest_entry,
        COALESCE(EXTRACT(EPOCH FROM AVG(NOW() - created_at)) / 86400, 0) AS avg_age_days
      FROM memories
    `),

    // Top topics (unnest topics array and count)
    pool.query(`
      SELECT topic, COUNT(*)::int AS count
      FROM memories, unnest(topics) AS topic
      GROUP BY topic
      ORDER BY count DESC
      LIMIT 10
    `),

    // Embedding counts
    pool.query(`
      SELECT
        COUNT(*) FILTER (WHERE embedding IS NOT NULL)::int AS with_embeddings,
        COUNT(*) FILTER (WHERE embedding IS NULL)::int AS without_embeddings
      FROM memories
    `),

    // Last write
    pool.query('SELECT MAX(updated_at) AS last_write FROM memories'),
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
      oldest_entry: stalenessRow.oldest_entry
        ? stalenessRow.oldest_entry.toISOString()
        : null,
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
      last_write: lastWriteRow.last_write
        ? lastWriteRow.last_write.toISOString()
        : null,
    },
  };
}
