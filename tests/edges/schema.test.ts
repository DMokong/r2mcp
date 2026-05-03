import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { setupEdgesTestDb, teardownEdgesTestDb, insertTestMemory } from './setup.js';
import type pg from 'pg';

let pool: pg.Pool;

beforeAll(async () => { pool = await setupEdgesTestDb(); });
afterAll(async () => { await teardownEdgesTestDb(); });

describe('memory_edges schema (AC1)', () => {
  it('table exists with all expected columns', async () => {
    const res = await pool.query(`
      SELECT column_name FROM information_schema.columns
      WHERE table_name = 'memory_edges'
    `);
    const cols = new Set(res.rows.map(r => r.column_name));
    for (const required of [
      'id', 'from_memory_id', 'to_memory_id', 'relation', 'confidence',
      'rationale', 'classifier_version', 'valid_from', 'valid_until',
      'created_at', 'updated_at',
    ]) {
      expect(cols.has(required), `missing column ${required}`).toBe(true);
    }
  });

  it('has the expected indexes', async () => {
    const res = await pool.query(`
      SELECT indexname FROM pg_indexes WHERE tablename = 'memory_edges'
    `);
    const idx = new Set(res.rows.map(r => r.indexname));
    expect(idx.has('idx_edges_from')).toBe(true);
    expect(idx.has('idx_edges_to')).toBe(true);
    expect(idx.has('idx_edges_currently_valid')).toBe(true);
  });

  it('CHECK constraint accepts all six relation types', async () => {
    const a = await insertTestMemory(pool, 'A');
    const b = await insertTestMemory(pool, 'B');
    for (const rel of ['supports', 'contradicts', 'supersedes', 'evolved_into', 'depends_on', 'related_to']) {
      await pool.query('DELETE FROM memory_edges');
      await expect(
        pool.query(
          `INSERT INTO memory_edges (from_memory_id, to_memory_id, relation, confidence, rationale, classifier_version)
           VALUES ($1, $2, $3, 0.9, 'test', 'v1')`,
          [a, b, rel],
        ),
      ).resolves.toBeDefined();
    }
  });

  it('CHECK constraint rejects bogus relation', async () => {
    const a = await insertTestMemory(pool, 'A');
    const b = await insertTestMemory(pool, 'B');
    await expect(
      pool.query(
        `INSERT INTO memory_edges (from_memory_id, to_memory_id, relation, confidence, rationale, classifier_version)
         VALUES ($1, $2, 'bogus', 0.9, 'x', 'v1')`,
        [a, b],
      ),
    ).rejects.toThrow();
  });

  it('unique constraint on (from, to, relation)', async () => {
    const a = await insertTestMemory(pool, 'A');
    const b = await insertTestMemory(pool, 'B');
    await pool.query('DELETE FROM memory_edges');
    await pool.query(
      `INSERT INTO memory_edges (from_memory_id, to_memory_id, relation, confidence, rationale, classifier_version)
       VALUES ($1, $2, 'supports', 0.8, 'r', 'v1')`,
      [a, b],
    );
    await expect(
      pool.query(
        `INSERT INTO memory_edges (from_memory_id, to_memory_id, relation, confidence, rationale, classifier_version)
         VALUES ($1, $2, 'supports', 0.9, 'r2', 'v1')`,
        [a, b],
      ),
    ).rejects.toThrow();
  });

  it('no-self CHECK rejects self-edges', async () => {
    const a = await insertTestMemory(pool, 'A');
    await expect(
      pool.query(
        `INSERT INTO memory_edges (from_memory_id, to_memory_id, relation, confidence, rationale, classifier_version)
         VALUES ($1, $1, 'supports', 0.9, 'r', 'v1')`,
        [a],
      ),
    ).rejects.toThrow();
  });

  it('ON DELETE CASCADE removes edges when memory deleted', async () => {
    const a = await insertTestMemory(pool, 'A');
    const b = await insertTestMemory(pool, 'B');
    await pool.query('DELETE FROM memory_edges');
    await pool.query(
      `INSERT INTO memory_edges (from_memory_id, to_memory_id, relation, confidence, rationale, classifier_version)
       VALUES ($1, $2, 'supports', 0.8, 'r', 'v1')`,
      [a, b],
    );
    await pool.query('DELETE FROM memories WHERE id = $1', [a]);
    const res = await pool.query('SELECT count(*)::int AS c FROM memory_edges');
    expect(res.rows[0].c).toBe(0);
  });

  it('Phase 2 query plan uses idx_edges_from (no Seq Scan)', async () => {
    const a = await insertTestMemory(pool, 'A');
    await pool.query('DELETE FROM memory_edges');

    // Insert filler memories AND filler edges between them in bulk to avoid
    // hundreds of round-trips against a remote Supabase. Selectivity matters:
    // we need `from_memory_id = a` to match a small fraction so the planner
    // picks the index. So we wire ~5 edges from `a` and ~995 edges between
    // pairs of filler memories.
    const N = 1000;
    await pool.query(
      `INSERT INTO memories (content, tier, type, topics, fingerprint)
       SELECT 'edges-filler-' || i,
              'project-context',
              'context',
              ARRAY[]::text[],
              'edges-test-filler-' || i || '-' || extract(epoch from clock_timestamp())::text
         FROM generate_series(1, $1) AS i`,
      [N],
    );

    // 5 edges from `a` to the first 5 filler memories
    await pool.query(
      `INSERT INTO memory_edges
         (from_memory_id, to_memory_id, relation, confidence, rationale, classifier_version)
       SELECT $1, m.id, 'supports', 0.8, 'r', 'v1'
         FROM memories m
        WHERE m.content LIKE 'edges-filler-%'
        ORDER BY m.content
        LIMIT 5`,
      [a],
    );

    // ~995 edges between pairs of filler memories (selectivity ~0.5%).
    // Use a CTE to enumerate fillers and join consecutive pairs.
    await pool.query(
      `WITH ranked AS (
         SELECT id, row_number() OVER (ORDER BY content) AS rn
           FROM memories
          WHERE content LIKE 'edges-filler-%'
       )
       INSERT INTO memory_edges
         (from_memory_id, to_memory_id, relation, confidence, rationale, classifier_version)
       SELECT r1.id, r2.id, 'supports', 0.8, 'r', 'v1'
         FROM ranked r1
         JOIN ranked r2 ON r2.rn = r1.rn + 1`,
    );

    // Refresh planner stats so the planner sees the index-friendly distribution
    await pool.query('ANALYZE memory_edges');

    const plan = await pool.query(
      `EXPLAIN (FORMAT JSON) SELECT * FROM memory_edges
       WHERE from_memory_id = $1 AND relation = 'supports'`,
      [a],
    );
    const planText = JSON.stringify(plan.rows[0]);
    expect(planText).not.toMatch(/"Node Type":\s*"Seq Scan"/);
  }, 60_000);
});
