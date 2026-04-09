import { getPool } from '../db.js';

export interface SearchFilter {
  type?: string;
  tier?: string;
  topics?: string[];
  persons?: string[];
  created_after?: string;
  created_before?: string;
}

export interface SearchInput {
  filter?: SearchFilter;
  query?: string;
  limit?: number;
}

export interface SearchResultEntry {
  id: string;
  content: string;
  tier: string;
  type: string;
  topics: string[];
  people: string[];
  section: string | null;
  date: string | null;
  created_at: string;
  updated_at: string;
}

export interface SearchResult {
  results: SearchResultEntry[];
  count: number;
}

export async function search(input: SearchInput): Promise<SearchResult> {
  const pool = getPool();
  const { filter, query, limit = 20 } = input;

  const conditions: string[] = [
    "type != 'rejection'",
  ];
  const params: unknown[] = [];
  let paramIndex = 1;

  if (filter) {
    if (filter.type) {
      conditions.push(`type = $${paramIndex}`);
      params.push(filter.type);
      paramIndex++;
    }

    if (filter.tier) {
      conditions.push(`tier = $${paramIndex}`);
      params.push(filter.tier);
      paramIndex++;
    }

    if (filter.topics && filter.topics.length > 0) {
      conditions.push(`topics && $${paramIndex}::text[]`);
      params.push(filter.topics);
      paramIndex++;
    }

    if (filter.persons && filter.persons.length > 0) {
      conditions.push(`people && $${paramIndex}::text[]`);
      params.push(filter.persons);
      paramIndex++;
    }

    if (filter.created_after) {
      conditions.push(`created_at >= $${paramIndex}::timestamptz`);
      params.push(filter.created_after);
      paramIndex++;
    }

    if (filter.created_before) {
      conditions.push(`created_at <= $${paramIndex}::timestamptz`);
      params.push(filter.created_before);
      paramIndex++;
    }
  }

  if (query) {
    conditions.push(`tsv @@ plainto_tsquery('english', $${paramIndex})`);
    params.push(query);
    paramIndex++;
  }

  params.push(limit);

  const sql = `
    SELECT id, content, tier, type, topics, people, section, date, created_at, updated_at
    FROM memories
    WHERE ${conditions.join(' AND ')}
    ORDER BY created_at DESC
    LIMIT $${paramIndex}
  `;

  const result = await pool.query(sql, params);

  return {
    results: result.rows.map((row) => ({
      id: row.id,
      content: row.content,
      tier: row.tier,
      type: row.type,
      topics: row.topics || [],
      people: row.people || [],
      section: row.section,
      date: row.date ? row.date.toISOString().split('T')[0] : null,
      created_at: row.created_at.toISOString(),
      updated_at: row.updated_at.toISOString(),
    })),
    count: result.rows.length,
  };
}
