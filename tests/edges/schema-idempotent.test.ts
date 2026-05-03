import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { setupEdgesTestDb, teardownEdgesTestDb, insertTestMemory } from './setup.js';
import { initDb } from '../../src/db.js';
import type pg from 'pg';

let pool: pg.Pool;

beforeAll(async () => { pool = await setupEdgesTestDb(); });
afterAll(async () => { await teardownEdgesTestDb(); });

describe('memory_edges schema idempotency (AC2)', () => {
  it('re-running migration does not destroy seed data', async () => {
    const a = await insertTestMemory(pool, 'A');
    const b = await insertTestMemory(pool, 'B');
    await pool.query('DELETE FROM memory_edges');
    await pool.query(
      `INSERT INTO memory_edges (from_memory_id, to_memory_id, relation, confidence, rationale, classifier_version)
       VALUES ($1, $2, 'supports', 0.8, 'seed rationale', 'v1')`,
      [a, b],
    );
    const before = await pool.query('SELECT count(*)::int AS c, max(rationale) AS r FROM memory_edges');
    expect(before.rows[0].c).toBe(1);
    expect(before.rows[0].r).toBe('seed rationale');

    // Re-apply schema
    await initDb();

    const after = await pool.query('SELECT count(*)::int AS c, max(rationale) AS r FROM memory_edges');
    expect(after.rows[0].c).toBe(1);
    expect(after.rows[0].r).toBe('seed rationale');
  });
});
