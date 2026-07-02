/**
 * JSONL import — the restore half of claw-i6td.4.
 *
 * Replays a stream produced by exporter.ts in file order (parents precede
 * children by construction). Idempotency contract:
 *   - Every insert is `ON CONFLICT DO NOTHING` (targetless — catches the PK
 *     AND the per-table unique keys: (project_scope,fingerprint),
 *     (from,to,relation), (project_scope,type,normalized_name), link PK).
 *   - rowCount 1 → inserted; 0 → skipped (already present).
 *   - Row-level failures (e.g. broken FK) are recorded and the run continues —
 *     a restore drill should tell you what didn't land, not die at row 37.
 *   - No wrapping transaction: partial restore is intended behavior.
 *
 * dryRun parses + validates and reports would-insert counts with zero writes.
 */

import type pg from 'pg';
import type { TableName } from './exporter.js';

export interface ImportOptions {
  pool: pg.Pool;
  dryRun?: boolean;
}

export interface TableCounts {
  inserted: number;
  skipped: number;
  errors: number;
}

export interface ImportSummary {
  dry_run: boolean;
  tables: Record<TableName, TableCounts>;
  /** Human-readable per-row failure descriptions, in encounter order. */
  errors: string[];
}

interface RowEnvelope {
  kind: 'row';
  table: TableName;
  data: Record<string, unknown>;
}

const INSERTS: Record<
  TableName,
  { sql: string; params: (d: Record<string, unknown>) => unknown[] }
> = {
  memories: {
    sql: `INSERT INTO memories
            (id, content, tier, type, section, topics, people, date, fingerprint,
             embedding, source_file, source_line, created_at, updated_at, project_scope)
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::vector,$11,$12,$13,$14,$15)
          ON CONFLICT DO NOTHING`,
    params: (d) => [
      d.id,
      d.content,
      d.tier,
      d.type,
      d.section,
      d.topics,
      d.people,
      d.date,
      d.fingerprint,
      d.embedding,
      d.source_file,
      d.source_line,
      d.created_at,
      d.updated_at,
      d.project_scope,
    ],
  },
  entities: {
    sql: `INSERT INTO entities
            (id, type, canonical_name, normalized_name, aliases, metadata,
             first_seen_at, last_seen_at, project_scope)
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
          ON CONFLICT DO NOTHING`,
    params: (d) => [
      d.id,
      d.type,
      d.canonical_name,
      d.normalized_name,
      d.aliases,
      d.metadata,
      d.first_seen_at,
      d.last_seen_at,
      d.project_scope,
    ],
  },
  memory_edges: {
    sql: `INSERT INTO memory_edges
            (id, from_memory_id, to_memory_id, relation, confidence, rationale,
             classifier_version, valid_from, valid_until, created_at, updated_at)
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
          ON CONFLICT DO NOTHING`,
    params: (d) => [
      d.id,
      d.from_memory_id,
      d.to_memory_id,
      d.relation,
      d.confidence,
      d.rationale,
      d.classifier_version,
      d.valid_from,
      d.valid_until,
      d.created_at,
      d.updated_at,
    ],
  },
  memory_entities: {
    sql: `INSERT INTO memory_entities
            (memory_id, entity_id, confidence, source, created_at)
          VALUES ($1,$2,$3,$4,$5)
          ON CONFLICT DO NOTHING`,
    params: (d) => [d.memory_id, d.entity_id, d.confidence, d.source, d.created_at],
  },
};

function emptyCounts(): Record<TableName, TableCounts> {
  return {
    memories: { inserted: 0, skipped: 0, errors: 0 },
    entities: { inserted: 0, skipped: 0, errors: 0 },
    memory_edges: { inserted: 0, skipped: 0, errors: 0 },
    memory_entities: { inserted: 0, skipped: 0, errors: 0 },
  };
}

export async function importFromLines(
  lines: Iterable<string>,
  opts: ImportOptions,
): Promise<ImportSummary> {
  const summary: ImportSummary = {
    dry_run: !!opts.dryRun,
    tables: emptyCounts(),
    errors: [],
  };

  let headerSeen = false;
  let lineNo = 0;
  for (const raw of lines) {
    lineNo++;
    const line = raw.trim();
    if (line === '') continue;

    let parsed: unknown;
    try {
      parsed = JSON.parse(line);
    } catch {
      summary.errors.push(`line ${lineNo}: not valid JSON`);
      continue;
    }
    const obj = parsed as Record<string, unknown>;

    if (!headerSeen) {
      if (obj.kind !== 'header') throw new Error(`line ${lineNo}: expected header as first record`);
      if (obj.version !== 1) throw new Error(`unsupported export version: ${String(obj.version)}`);
      headerSeen = true;
      continue;
    }

    if (obj.kind !== 'row') {
      summary.errors.push(`line ${lineNo}: unknown record kind '${String(obj.kind)}'`);
      continue;
    }
    const row = obj as unknown as RowEnvelope;
    const insert = INSERTS[row.table];
    if (!insert) {
      summary.errors.push(`line ${lineNo}: unknown table '${String(row.table)}'`);
      continue;
    }

    if (opts.dryRun) {
      // Would-insert: report as inserted without touching the database.
      summary.tables[row.table].inserted++;
      continue;
    }

    try {
      const res = await opts.pool.query(insert.sql, insert.params(row.data));
      if (res.rowCount === 1) summary.tables[row.table].inserted++;
      else summary.tables[row.table].skipped++;
    } catch (err) {
      summary.tables[row.table].errors++;
      summary.errors.push(`line ${lineNo}: ${row.table} insert failed — ${(err as Error).message}`);
    }
  }

  if (!headerSeen) throw new Error('empty or headerless file — nothing imported');
  return summary;
}
