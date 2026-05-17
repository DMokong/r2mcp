// SPEC-046 Task 1 — schema migration assertions.
//
// Note on test-DB safety (claw-0vsn): we use setupTestDb()/teardownTestDb()
// from tests/setup.ts. That setup calls pickTestUrl() from test-db-guard.ts,
// which refuses to run if R2MCP_DATABASE_URL points at a non-local / non-test
// database. We never read R2MCP_DATABASE_URL directly in this file.

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import type pg from 'pg';
import { setupTestDb, teardownTestDb } from '../setup.js';
import { initDb } from '../../src/db.js';

let pool: pg.Pool;

beforeAll(async () => {
  pool = await setupTestDb();
});

afterAll(async () => {
  await teardownTestDb();
});

// Each test starts from a clean slate for entities + memory_entities.
// memory_entities has ON DELETE CASCADE from both sides, so wiping the
// parent tables is enough — but we also clear memories to keep FKs happy.
beforeEach(async () => {
  await pool.query('DELETE FROM memory_entities');
  await pool.query('DELETE FROM entities');
  await pool.query('DELETE FROM memories');
});

describe('SPEC-046 entities + memory_entities schema', () => {
  it('AC1: entities table exists with four-type CHECK constraint', async () => {
    const { rows } = await pool.query(`
      SELECT pg_get_constraintdef(oid) AS def
      FROM pg_constraint
      WHERE conrelid = 'entities'::regclass AND contype = 'c'
    `);
    expect(rows.some((r: { def: string }) => /project.*person.*tool.*decision/.test(r.def))).toBe(true);
  });

  it('AC1: entities has unique(type, normalized_name)', async () => {
    await pool.query(
      `INSERT INTO entities (type, canonical_name, normalized_name) VALUES ('project', 'A', 'a')`,
    );
    await expect(
      pool.query(
        `INSERT INTO entities (type, canonical_name, normalized_name) VALUES ('project', 'A2', 'a')`,
      ),
    ).rejects.toThrow(/unique/i);
  });

  it('AC1: memory_entities has (memory_id, entity_id) PK', async () => {
    // Insert a memory + entity, link twice → second insert should fail
    const { rows: [m] } = await pool.query(
      `INSERT INTO memories (content, tier, type, fingerprint) VALUES ('x', 'preferences', 'preference', 'fp-test-1') RETURNING id`,
    );
    const { rows: [e] } = await pool.query(
      `INSERT INTO entities (type, canonical_name, normalized_name) VALUES ('tool', 'pgvector', 'pgvector') RETURNING id`,
    );
    await pool.query(
      `INSERT INTO memory_entities (memory_id, entity_id) VALUES ($1, $2)`,
      [m.id, e.id],
    );
    await expect(
      pool.query(`INSERT INTO memory_entities (memory_id, entity_id) VALUES ($1, $2)`, [m.id, e.id]),
    ).rejects.toThrow(/duplicate/i);
  });

  it('AC1: re-running initDb is idempotent (no-op)', async () => {
    await expect(initDb()).resolves.not.toThrow();
  });
});
