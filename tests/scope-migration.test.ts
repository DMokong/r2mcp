import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { setupTestDb, teardownTestDb } from './setup.js';
import type pg from 'pg';

// claw-nyxd.1: the scope migration must apply idempotently to a LIVE table that
// already holds rows written before the project_scope column existed (the ~70
// production ClaudeClaw memories). schema.sql IS the migration system — it
// re-executes on every server boot — so this proves: existing rows backfill to
// the 'global' default, the per-scope composite unique replaces the old global
// unique(fingerprint), and a second application is a no-op.

const SCHEMA_SQL = readFileSync(resolve(__dirname, '..', 'src', 'schema.sql'), 'utf-8');

let pool: pg.Pool;

beforeAll(async () => {
  pool = await setupTestDb();
});
afterAll(async () => {
  await teardownTestDb();
});

async function simulatePreScopeSchema() {
  // Roll the memories table back to its pre-scope shape: drop the scope column
  // and the composite unique, restore the legacy single-column unique(fingerprint).
  await pool.query('DELETE FROM memory_entities');
  await pool.query('DELETE FROM memories');
  await pool.query('ALTER TABLE memories DROP CONSTRAINT IF EXISTS memories_scope_fingerprint_key');
  await pool.query('ALTER TABLE memories DROP COLUMN IF EXISTS project_scope');
  await pool.query(
    'ALTER TABLE memories ADD CONSTRAINT memories_fingerprint_key UNIQUE (fingerprint)',
  );
}

async function uniqueConstraintColumns(): Promise<string[][]> {
  const r = await pool.query(
    `SELECT con.conname,
            array_agg(att.attname::text ORDER BY att.attnum) AS cols
       FROM pg_constraint con
       JOIN pg_class rel ON rel.oid = con.conrelid
       JOIN pg_attribute att ON att.attrelid = con.conrelid AND att.attnum = ANY (con.conkey)
      WHERE rel.relname = 'memories' AND con.contype = 'u'
      GROUP BY con.conname`,
  );
  return r.rows.map((row) => row.cols as string[]);
}

describe('scope migration (claw-nyxd.1)', () => {
  it('backfills a legacy row (written before the column existed) to the global default', async () => {
    await simulatePreScopeSchema();
    await pool.query(
      `INSERT INTO memories (content, tier, type, fingerprint)
       VALUES ('legacy memory from before scope', 'preferences', 'preference', 'legacy-fp-001')`,
    );

    await pool.query(SCHEMA_SQL);

    const r = await pool.query(
      "SELECT project_scope FROM memories WHERE fingerprint = 'legacy-fp-001'",
    );
    expect(r.rows).toHaveLength(1);
    expect(r.rows[0].project_scope).toBe('global');
    const nulls = await pool.query('SELECT COUNT(*)::int AS n FROM memories WHERE project_scope IS NULL');
    expect(nulls.rows[0].n).toBe(0);
  });

  it('replaces the global unique(fingerprint) with a composite unique(project_scope, fingerprint)', async () => {
    await pool.query(SCHEMA_SQL);
    const uniques = (await uniqueConstraintColumns()).map((cols) => [...cols].sort());
    // The composite must exist (column order is incidental)...
    expect(uniques).toContainEqual(['fingerprint', 'project_scope']);
    // ...and no single-column unique on fingerprint may remain.
    expect(uniques).not.toContainEqual(['fingerprint']);
  });

  it('permits the same fingerprint in two different scopes (per-scope dedup)', async () => {
    await pool.query(SCHEMA_SQL);
    await pool.query('DELETE FROM memories');
    await pool.query(
      `INSERT INTO memories (content, tier, type, fingerprint, project_scope)
       VALUES ('same content', 'preferences', 'preference', 'shared-fp', 'projectA')`,
    );
    await expect(
      pool.query(
        `INSERT INTO memories (content, tier, type, fingerprint, project_scope)
         VALUES ('same content', 'preferences', 'preference', 'shared-fp', 'projectB')`,
      ),
    ).resolves.toBeTruthy();
    // ...but the SAME scope still rejects a duplicate fingerprint.
    await expect(
      pool.query(
        `INSERT INTO memories (content, tier, type, fingerprint, project_scope)
         VALUES ('same content', 'preferences', 'preference', 'shared-fp', 'projectA')`,
      ),
    ).rejects.toThrow();
  });

  it('is idempotent — applying schema.sql a second time does not error', async () => {
    await pool.query(SCHEMA_SQL);
    await expect(pool.query(SCHEMA_SQL)).resolves.toBeTruthy();
  });

  it('scopes the entities unique key to (project_scope, type, normalized_name)', async () => {
    await pool.query(SCHEMA_SQL);
    const r = await pool.query(
      `SELECT array_agg(att.attname::text ORDER BY att.attnum) AS cols
         FROM pg_constraint con
         JOIN pg_class rel ON rel.oid = con.conrelid
         JOIN pg_attribute att ON att.attrelid = con.conrelid AND att.attnum = ANY (con.conkey)
        WHERE rel.relname = 'entities' AND con.conname = 'entities_unique'
        GROUP BY con.conname`,
    );
    expect([...r.rows[0].cols].sort()).toEqual(['normalized_name', 'project_scope', 'type']);
  });
});
