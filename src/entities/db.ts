// SPEC-046 Task 4 — entities DB layer.
//
// Pure DB access for the entity extraction pipeline. All functions accept
// either a pg.Pool or pg.PoolClient (both expose a compatible .query()).
// Callers in the extractor driver and recall path use the shared pool from
// src/db.ts; tests pass the pool directly.

import type pg from 'pg';
import { normalizeEntityName } from './normalize.js';
import type { EntityRow, EntityType } from './types.js';

type DbClient = pg.Pool | pg.PoolClient;

export interface UpsertEntityInput {
  type: EntityType;
  canonical_name: string;
  aliases?: string[];
}
export interface UpsertEntityResult {
  id: string;
  created: boolean;
}

export async function upsertEntity(
  client: DbClient,
  input: UpsertEntityInput,
): Promise<UpsertEntityResult> {
  const normalized = normalizeEntityName(input.canonical_name);
  const aliases = (input.aliases ?? [])
    .map((a) => normalizeEntityName(a))
    .filter((a) => a.length > 0);

  // ON CONFLICT also merges aliases (claw-2jbo, PR #1 finding 3). Prior shape
  // dropped EXCLUDED.aliases silently, requiring callers to invoke
  // mergeAliases() separately. Direct consumers of upsertEntity now get the
  // union-merge for free. ARRAY(SELECT DISTINCT UNNEST(...)) is the same
  // union shape used by mergeAliases below.
  const { rows } = await client.query(
    `INSERT INTO entities (type, canonical_name, normalized_name, aliases)
     VALUES ($1, $2, $3, $4::text[])
     ON CONFLICT (type, normalized_name) DO UPDATE SET
       aliases = ARRAY(SELECT DISTINCT UNNEST(entities.aliases || EXCLUDED.aliases)),
       last_seen_at = NOW()
     RETURNING id, (xmax = 0) AS created`,
    [input.type, input.canonical_name, normalized, aliases],
  );
  return { id: rows[0].id, created: rows[0].created };
}

export async function findEntityByInput(
  client: DbClient,
  input: string,
): Promise<EntityRow | null> {
  const normalized = normalizeEntityName(input);
  if (!normalized) return null;

  const { rows } = await client.query<EntityRow>(
    `SELECT id, type, canonical_name, normalized_name, aliases, metadata, first_seen_at, last_seen_at
     FROM entities
     WHERE normalized_name = $1 OR $1 = ANY(aliases)
     LIMIT 1`,
    [normalized],
  );
  return rows[0] ?? null;
}

export async function mergeAliases(
  client: DbClient,
  entityId: string,
  newAliases: string[],
): Promise<string[]> {
  const normalized = newAliases.map((a) => normalizeEntityName(a)).filter((a) => a.length > 0);
  const { rows } = await client.query(
    `UPDATE entities
     SET aliases = ARRAY(SELECT DISTINCT UNNEST(aliases || $2::text[])),
         last_seen_at = NOW()
     WHERE id = $1
     RETURNING aliases`,
    [entityId, normalized],
  );
  return rows[0]?.aliases ?? [];
}

export interface LinkResult {
  inserted: boolean;
}
export async function linkMemoryToEntity(
  client: DbClient,
  memoryId: string,
  entityId: string,
  confidence: number,
  source: string,
): Promise<LinkResult> {
  const { rowCount } = await client.query(
    `INSERT INTO memory_entities (memory_id, entity_id, confidence, source)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (memory_id, entity_id) DO NOTHING`,
    [memoryId, entityId, confidence, source],
  );
  return { inserted: (rowCount ?? 0) > 0 };
}

export async function getTopEntitiesByFrequency(
  client: DbClient,
  n: number,
): Promise<
  Array<{
    id: string;
    type: EntityType;
    canonical_name: string;
    normalized_name: string;
    aliases: string[];
    link_count: number;
  }>
> {
  // Returns id + normalized_name (additive vs. prior shape) so callers can
  // build an in-memory lookup keyed by normalized canonical AND alias, used
  // by the extractor to resolve LLM-matched canonical_names without a DB
  // round-trip per match (claw-2jbo finding 1).
  const { rows } = await client.query(
    `SELECT e.id, e.type, e.canonical_name, e.normalized_name, e.aliases,
            COUNT(me.memory_id)::int AS link_count
     FROM entities e
     LEFT JOIN memory_entities me ON me.entity_id = e.id
     GROUP BY e.id
     ORDER BY link_count DESC, e.canonical_name ASC
     LIMIT $1`,
    [n],
  );
  return rows;
}

export interface CandidateFilter {
  sinceDays?: number;
  /**
   * When true, bypass the "no existing entity rows OR updated since most-recent link"
   * pre-filter and return ALL memories in the corpus. Spec R6: full-corpus
   * re-extraction is opt-in via this flag, not the default. The `sinceDays`
   * filter still applies if both are set (though the CLI/MCP guards against
   * passing them together).
   */
  full?: boolean;
}
export async function findCandidateMemories(
  client: DbClient,
  filter: CandidateFilter,
): Promise<Array<{ id: string; content: string; updated_at: Date }>> {
  const params: unknown[] = [];
  const clauses: string[] = [];
  if (!filter.full) {
    // Default pre-filter: no existing entity rows OR memory updated since most recent link
    clauses.push(`(
      NOT EXISTS (SELECT 1 FROM memory_entities me WHERE me.memory_id = m.id)
      OR m.updated_at > (SELECT MAX(me.created_at) FROM memory_entities me WHERE me.memory_id = m.id)
    )`);
  }
  if (filter.sinceDays !== undefined) {
    if (filter.sinceDays === 0) return [];
    params.push(filter.sinceDays);
    clauses.push(`m.updated_at >= NOW() - ($${params.length}::int * INTERVAL '1 day')`);
  }
  const where = clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : '';
  const { rows } = await client.query(
    `SELECT m.id, m.content, m.updated_at
     FROM memories m
     ${where}
     ORDER BY m.updated_at DESC`,
    params,
  );
  return rows;
}

export async function getEntityLinksForMemories(
  client: DbClient,
  memoryIds: string[],
): Promise<Map<string, Array<{ type: EntityType; canonical_name: string; confidence: number }>>> {
  if (memoryIds.length === 0) return new Map();
  // Cast confidence::float — schema is NUMERIC(3,2) to match memory_edges
  // (SPEC-043), but pg returns NUMERIC as a JS string by default. Callers
  // (recall's EntityLink) type this as number, so cast at the query.
  const { rows } = await client.query(
    `SELECT me.memory_id, e.type, e.canonical_name, me.confidence::float AS confidence
     FROM memory_entities me
     JOIN entities e ON e.id = me.entity_id
     WHERE me.memory_id = ANY($1::uuid[])`,
    [memoryIds],
  );
  const out = new Map<
    string,
    Array<{ type: EntityType; canonical_name: string; confidence: number }>
  >();
  for (const r of rows) {
    const arr = out.get(r.memory_id) ?? [];
    arr.push({
      type: r.type,
      canonical_name: r.canonical_name,
      confidence: r.confidence,
    });
    out.set(r.memory_id, arr);
  }
  return out;
}
