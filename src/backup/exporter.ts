/**
 * JSONL export — the backup half of claw-i6td.4.
 *
 * Stream shape (version 1):
 *   line 1:  {kind:'header', version:1, exported_at, scope, counts}
 *   line 2+: {kind:'row', table, data} — parents (memories, entities) before
 *            children (memory_edges, memory_entities), so a restore into an
 *            empty database never trips a foreign key.
 *
 * Fidelity rules:
 *   - UUIDs are exported verbatim — the edge/link graph depends on them.
 *   - embedding is exported as pgvector text ('[0.1,...]'); tsv (GENERATED) is
 *     excluded — Postgres recomputes it on insert.
 *   - Timestamps/dates/numerics travel as text; pg casts them back on import.
 *   - Default: ALL scopes (a backup that silently drops scopes is a footgun).
 *     Pass {scope} to narrow. memory_edges have no scope column — when
 *     filtering, an edge is included iff BOTH endpoints are in the export set.
 */

import type pg from 'pg';

export interface ExportOptions {
  /** Restrict memories/entities (and transitively edges/links) to one scope. */
  scope?: string;
}

export interface ExportHeader {
  kind: 'header';
  version: 1;
  exported_at: string;
  scope: string | null;
  counts: Record<TableName, number>;
}

export type TableName = 'memories' | 'entities' | 'memory_edges' | 'memory_entities';

/** FK-safe order: parents first. Import replays in file order. */
export const TABLE_ORDER: readonly TableName[] = [
  'memories',
  'entities',
  'memory_edges',
  'memory_entities',
];

export async function exportToLines(pool: pg.Pool, opts: ExportOptions): Promise<string[]> {
  const scopeWhere = opts.scope ? `WHERE project_scope = $1` : '';
  const scopeParams = opts.scope ? [opts.scope] : [];

  const memories = await pool.query(
    `SELECT id, content, tier, type, section, topics, people,
            date::text AS date, fingerprint, embedding::text AS embedding,
            source_file, source_line, created_at::text AS created_at,
            updated_at::text AS updated_at, project_scope
     FROM memories ${scopeWhere} ORDER BY created_at, id`,
    scopeParams,
  );

  const entities = await pool.query(
    `SELECT id, type, canonical_name, normalized_name, aliases, metadata,
            first_seen_at::text AS first_seen_at, last_seen_at::text AS last_seen_at,
            project_scope
     FROM entities ${scopeWhere} ORDER BY first_seen_at, id`,
    scopeParams,
  );

  // Edges/links have no scope column — when filtering, include only rows whose
  // endpoints are all inside the exported memory/entity set.
  const memWhere = opts.scope
    ? `WHERE from_memory_id IN (SELECT id FROM memories WHERE project_scope = $1)
         AND to_memory_id   IN (SELECT id FROM memories WHERE project_scope = $1)`
    : '';
  const edges = await pool.query(
    `SELECT id, from_memory_id, to_memory_id, relation, confidence::text AS confidence,
            rationale, classifier_version, valid_from::text AS valid_from,
            valid_until::text AS valid_until, created_at::text AS created_at,
            updated_at::text AS updated_at
     FROM memory_edges ${memWhere} ORDER BY created_at, id`,
    scopeParams,
  );

  const linkWhere = opts.scope
    ? `WHERE memory_id IN (SELECT id FROM memories WHERE project_scope = $1)
         AND entity_id IN (SELECT id FROM entities WHERE project_scope = $1)`
    : '';
  const links = await pool.query(
    `SELECT memory_id, entity_id, confidence::text AS confidence, source,
            created_at::text AS created_at
     FROM memory_entities ${linkWhere} ORDER BY created_at, memory_id, entity_id`,
    scopeParams,
  );

  const byTable: Record<TableName, Record<string, unknown>[]> = {
    memories: memories.rows,
    entities: entities.rows,
    memory_edges: edges.rows,
    memory_entities: links.rows,
  };

  const header: ExportHeader = {
    kind: 'header',
    version: 1,
    exported_at: new Date().toISOString(),
    scope: opts.scope ?? null,
    counts: {
      memories: memories.rows.length,
      entities: entities.rows.length,
      memory_edges: edges.rows.length,
      memory_entities: links.rows.length,
    },
  };

  const lines: string[] = [JSON.stringify(header)];
  for (const table of TABLE_ORDER) {
    for (const data of byTable[table]) {
      lines.push(JSON.stringify({ kind: 'row', table, data }));
    }
  }
  return lines;
}
