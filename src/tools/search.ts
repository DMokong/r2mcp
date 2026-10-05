import { getPool } from '../db.js';
import { currentScope, DEFAULT_SCOPE } from '../env.js';
import { scopeClause } from './recall.js';

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
  /** claw-nyxd: when true, search across ALL project scopes (default: current + global). */
  all_scopes?: boolean;
  /**
   * trk-cou: read a SPECIFIC project scope (+ global) instead of the env's
   * current scope — mirrors recall()'s `scope` param. Ignored when all_scopes
   * is true.
   */
  scope?: string;
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
  const { filter, query, limit = 20, all_scopes = false, scope } = input;

  const conditions: string[] = ["type != 'rejection'"];
  const params: unknown[] = [];

  // trk-cou: same scope resolution recall() uses — union of the requested (or
  // current) scope with DEFAULT_SCOPE, or no filter at all (null) when
  // all_scopes is set. Reusing scopeClause keeps the two tools from drifting
  // apart the way they did before (search() had its own inline predicate that
  // never resolved an explicit `scope`, unlike recall()).
  const scopes: string[] | null = all_scopes
    ? null
    : Array.from(new Set([scope ?? currentScope(), DEFAULT_SCOPE]));
  const scopeFilter = scopeClause('', params, scopes);
  if (scopeFilter) {
    conditions.push(scopeFilter.replace(/^ AND /, ''));
  }

  let paramIndex = params.length + 1;

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
      // DATE reads back as its stored 'YYYY-MM-DD' string (trk-fj8 parser).
      date: row.date ?? null,
      created_at: row.created_at.toISOString(),
      updated_at: row.updated_at.toISOString(),
    })),
    count: result.rows.length,
  };
}
