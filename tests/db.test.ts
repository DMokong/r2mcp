import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { setupTestDb, teardownTestDb } from './setup.js';
import type pg from 'pg';

let pool: pg.Pool;

beforeAll(async () => { pool = await setupTestDb(); });
afterAll(async () => { await teardownTestDb(); });

describe('database', () => {
  it('connects and has the memories table', async () => {
    const res = await pool.query(
      "SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'memories')"
    );
    expect(res.rows[0].exists).toBe(true);
  });

  it('has pgvector extension enabled', async () => {
    const res = await pool.query("SELECT extname FROM pg_extension WHERE extname = 'vector'");
    expect(res.rows.length).toBe(1);
  });

  it('has tsvector column for full-text search', async () => {
    const res = await pool.query(
      "SELECT column_name FROM information_schema.columns WHERE table_name = 'memories' AND column_name = 'tsv'"
    );
    expect(res.rows.length).toBe(1);
  });
});
