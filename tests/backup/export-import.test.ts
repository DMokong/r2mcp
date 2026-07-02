import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { setupTestDb, teardownTestDb } from '../setup.js';
import { exportToLines } from '../../src/backup/exporter.js';
import { importFromLines } from '../../src/backup/importer.js';
import type pg from 'pg';

// claw-i6td.4: paired export/import JSONL — the backup/restore story.
// Contract: single JSONL stream, line 1 = header {kind:'header', version, counts},
// then {kind:'row', table, data} in FK-safe order. Import preserves UUIDs
// (edges/links depend on them), is idempotent on PK/unique keys, and reports
// per-row errors without aborting the run.

let pool: pg.Pool;

beforeAll(async () => {
  pool = await setupTestDb();
});
afterAll(async () => {
  await teardownTestDb();
});
beforeEach(async () => {
  await pool.query('DELETE FROM memory_entities');
  await pool.query('DELETE FROM memory_edges');
  await pool.query('DELETE FROM entities');
  await pool.query('DELETE FROM memories');
});

/** Seed one row in each of the four tables; returns their ids. */
async function seedGraph(scope = 'global') {
  const emb = `[${Array.from({ length: 1536 }, (_, i) => (i === 0 ? 0.5 : 0)).join(',')}]`;
  const m1 = (
    await pool.query(
      `INSERT INTO memories (content, tier, type, section, topics, people, date, fingerprint, embedding, project_scope)
       VALUES ('backup test alpha', 'preferences', 'preference', 'Sec', '{tooling,backup}', '{dustin}',
               '2026-03-09', 'fp-alpha', $1::vector, $2)
       RETURNING id`,
      [emb, scope],
    )
  ).rows[0].id as string;
  const m2 = (
    await pool.query(
      `INSERT INTO memories (content, tier, type, fingerprint, project_scope)
       VALUES ('backup test beta', 'project-context', 'context', 'fp-beta', $1)
       RETURNING id`,
      [scope],
    )
  ).rows[0].id as string;
  const edge = (
    await pool.query(
      `INSERT INTO memory_edges (from_memory_id, to_memory_id, relation, confidence, rationale, classifier_version)
       VALUES ($1, $2, 'supports', 0.9, 'alpha supports beta', 'test-v1')
       RETURNING id`,
      [m1, m2],
    )
  ).rows[0].id as string;
  const ent = (
    await pool.query(
      `INSERT INTO entities (type, canonical_name, normalized_name, aliases, metadata, project_scope)
       VALUES ('tool', 'Backup Tool', 'backup tool', '{bt}', '{"k":"v"}', $1)
       RETURNING id`,
      [scope],
    )
  ).rows[0].id as string;
  await pool.query(
    `INSERT INTO memory_entities (memory_id, entity_id, confidence, source) VALUES ($1, $2, 0.8, 'test')`,
    [m1, ent],
  );
  return { m1, m2, edge, ent };
}

async function wipeAll() {
  await pool.query('DELETE FROM memory_entities');
  await pool.query('DELETE FROM memory_edges');
  await pool.query('DELETE FROM entities');
  await pool.query('DELETE FROM memories');
}

describe('export format contract', () => {
  it('emits a header line then enveloped rows in FK-safe order', async () => {
    await seedGraph();
    const lines = await exportToLines(pool, {});
    const header = JSON.parse(lines[0]);
    expect(header.kind).toBe('header');
    expect(header.version).toBe(1);
    expect(header.counts).toEqual({ memories: 2, entities: 1, memory_edges: 1, memory_entities: 1 });
    expect(typeof header.exported_at).toBe('string');

    const rows = lines.slice(1).map((l) => JSON.parse(l));
    expect(rows).toHaveLength(5);
    for (const r of rows) expect(r.kind).toBe('row');
    // FK-safe ordering: all memories and entities precede edges and links
    const tableSeq = rows.map((r) => r.table);
    const lastParent = Math.max(tableSeq.lastIndexOf('memories'), tableSeq.lastIndexOf('entities'));
    const firstChild = Math.min(
      ...['memory_edges', 'memory_entities'].map((t) => tableSeq.indexOf(t)).filter((i) => i >= 0),
    );
    expect(lastParent).toBeLessThan(firstChild);
  });

  it('excludes the generated tsv column and preserves the embedding as pgvector text', async () => {
    await seedGraph();
    const lines = await exportToLines(pool, {});
    const mem = lines
      .slice(1)
      .map((l) => JSON.parse(l))
      .find((r) => r.table === 'memories' && r.data.fingerprint === 'fp-alpha');
    expect(mem.data.tsv).toBeUndefined();
    expect(mem.data.embedding).toMatch(/^\[0\.5,0,/);
    expect(mem.data.topics).toEqual(['tooling', 'backup']);
    expect(mem.data.date).toBe('2026-03-09');
  });

  it('--scope filters memories and entities to that scope only', async () => {
    await seedGraph('scopeA');
    await pool.query(
      `INSERT INTO memories (content, tier, type, fingerprint, project_scope)
       VALUES ('other scope row', 'preferences', 'preference', 'fp-other', 'scopeB')`,
    );
    const lines = await exportToLines(pool, { scope: 'scopeA' });
    const header = JSON.parse(lines[0]);
    expect(header.scope).toBe('scopeA');
    expect(header.counts.memories).toBe(2);
    const rows = lines.slice(1).map((l) => JSON.parse(l));
    for (const r of rows.filter((x) => x.table === 'memories')) {
      expect(r.data.project_scope).toBe('scopeA');
    }
  });
});

describe('round-trip restore', () => {
  it('restores all four tables with identical ids and field fidelity into an empty db', async () => {
    const ids = await seedGraph();
    const lines = await exportToLines(pool, {});
    await wipeAll();

    const summary = await importFromLines(lines, { pool });
    expect(summary.errors).toHaveLength(0);
    expect(summary.tables.memories).toEqual({ inserted: 2, skipped: 0, errors: 0 });
    expect(summary.tables.memory_edges).toEqual({ inserted: 1, skipped: 0, errors: 0 });
    expect(summary.tables.entities).toEqual({ inserted: 1, skipped: 0, errors: 0 });
    expect(summary.tables.memory_entities).toEqual({ inserted: 1, skipped: 0, errors: 0 });

    // UUIDs preserved → graph intact
    const m = await pool.query(`SELECT * FROM memories WHERE id = $1`, [ids.m1]);
    expect(m.rows).toHaveLength(1);
    expect(m.rows[0].content).toBe('backup test alpha');
    expect(m.rows[0].topics).toEqual(['tooling', 'backup']);
    expect(m.rows[0].people).toEqual(['dustin']);
    const emb = await pool.query(`SELECT embedding::text AS e FROM memories WHERE id = $1`, [ids.m1]);
    expect(emb.rows[0].e).toMatch(/^\[0\.5,0,/);
    const e = await pool.query(`SELECT * FROM memory_edges WHERE id = $1`, [ids.edge]);
    expect(e.rows).toHaveLength(1);
    expect(e.rows[0].rationale).toBe('alpha supports beta');
    const ent = await pool.query(`SELECT * FROM entities WHERE id = $1`, [ids.ent]);
    expect(ent.rows[0].metadata).toEqual({ k: 'v' });
    const link = await pool.query(`SELECT * FROM memory_entities WHERE memory_id = $1`, [ids.m1]);
    expect(link.rows).toHaveLength(1);
  });

  it('re-importing the same file is a no-op (idempotent on PK/unique keys)', async () => {
    await seedGraph();
    const lines = await exportToLines(pool, {});
    // no wipe — import over live rows
    const summary = await importFromLines(lines, { pool });
    expect(summary.errors).toHaveLength(0);
    expect(summary.tables.memories).toEqual({ inserted: 0, skipped: 2, errors: 0 });
    expect(summary.tables.memory_edges).toEqual({ inserted: 0, skipped: 1, errors: 0 });
    expect(summary.tables.entities).toEqual({ inserted: 0, skipped: 1, errors: 0 });
    expect(summary.tables.memory_entities).toEqual({ inserted: 0, skipped: 1, errors: 0 });
    const n = await pool.query(`SELECT count(*)::int AS n FROM memories`);
    expect(n.rows[0].n).toBe(2);
  });

  it('reports per-row errors (broken FK) without aborting the rest of the import', async () => {
    await seedGraph();
    const lines = await exportToLines(pool, {});
    await wipeAll();
    // Corrupt: an edge referencing a memory id that exists nowhere
    const orphanEdge = JSON.stringify({
      kind: 'row',
      table: 'memory_edges',
      data: {
        id: '00000000-0000-4000-8000-000000000001',
        from_memory_id: '00000000-0000-4000-8000-00000000dead',
        to_memory_id: '00000000-0000-4000-8000-00000000beef',
        relation: 'supports',
        confidence: '0.50',
        rationale: 'orphan',
        classifier_version: 'test-v1',
        valid_from: '2026-01-01T00:00:00+00',
        valid_until: null,
        created_at: '2026-01-01T00:00:00+00',
        updated_at: '2026-01-01T00:00:00+00',
      },
    });
    const summary = await importFromLines([...lines, orphanEdge], { pool });
    expect(summary.tables.memory_edges.inserted).toBe(1);
    expect(summary.tables.memory_edges.errors).toBe(1);
    expect(summary.errors).toHaveLength(1);
    expect(summary.errors[0]).toMatch(/memory_edges/);
    // everything else still landed
    const n = await pool.query(`SELECT count(*)::int AS n FROM memories`);
    expect(n.rows[0].n).toBe(2);
  });

  it('dry-run validates and counts without writing anything', async () => {
    await seedGraph();
    const lines = await exportToLines(pool, {});
    await wipeAll();
    const summary = await importFromLines(lines, { pool, dryRun: true });
    expect(summary.dry_run).toBe(true);
    expect(summary.tables.memories.inserted).toBe(2); // would-insert count
    const n = await pool.query(`SELECT count(*)::int AS n FROM memories`);
    expect(n.rows[0].n).toBe(0);
  });

  it('rejects a file with an unknown header version', async () => {
    const bad = [JSON.stringify({ kind: 'header', version: 99, counts: {} })];
    await expect(importFromLines(bad, { pool })).rejects.toThrow(/version/);
  });
});
