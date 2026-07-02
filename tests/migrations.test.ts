import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setupTestDb, teardownTestDb } from './setup.js';
import {
  listMigrations,
  appliedVersion,
  applyMigrations,
  verifySchemaVersion,
  expectedSchemaVersion,
} from '../src/migrations.js';
import { initDb } from '../src/db.js';
import type pg from 'pg';

// claw-i6td.5: schema_version + numbered migrations. Boot (initDb) VERIFIES the
// version and fails with a "run npm run setup" pointer; only setup/tests apply
// DDL. The bundled 001_baseline.sql is today's idempotent schema.sql, so
// existing deployments adopt the system with a no-op apply.

let pool: pg.Pool;

beforeAll(async () => {
  pool = await setupTestDb();
});
afterAll(async () => {
  await teardownTestDb();
});

describe('listMigrations — bundled migration discovery', () => {
  it('finds the bundled migrations, starting at 001_baseline, contiguous ascending', () => {
    const migrations = listMigrations();
    expect(migrations.length).toBeGreaterThanOrEqual(1);
    expect(migrations[0].version).toBe(1);
    expect(migrations[0].name).toMatch(/baseline/);
    for (let i = 0; i < migrations.length; i++) {
      expect(migrations[i].version).toBe(i + 1);
      expect(migrations[i].sql.length).toBeGreaterThan(0);
    }
    expect(expectedSchemaVersion()).toBe(migrations[migrations.length - 1].version);
  });

  it('rejects a migrations dir with a gap in version numbers', () => {
    const dir = mkdtempSync(join(tmpdir(), 'r2mcp-mig-'));
    writeFileSync(join(dir, '001_a.sql'), 'SELECT 1;');
    writeFileSync(join(dir, '003_b.sql'), 'SELECT 1;');
    expect(() => listMigrations(dir)).toThrow(/contiguous|gap/i);
  });

  it('rejects duplicate version numbers', () => {
    const dir = mkdtempSync(join(tmpdir(), 'r2mcp-mig-'));
    writeFileSync(join(dir, '001_a.sql'), 'SELECT 1;');
    writeFileSync(join(dir, '001_b.sql'), 'SELECT 1;');
    expect(() => listMigrations(dir)).toThrow(/duplicate/i);
  });
});

describe('applyMigrations — adoption, recording, idempotency', () => {
  it('adopts an existing schema with no schema_migrations table (baseline is idempotent)', async () => {
    // setupTestDb provisioned the schema; simulate a pre-migration deployment
    await pool.query('DROP TABLE IF EXISTS schema_migrations');
    expect(await appliedVersion(pool)).toBe(0);

    const result = await applyMigrations(pool);
    expect(result.applied.map((m) => m.version)).toEqual(
      listMigrations().map((m) => m.version),
    );
    expect(await appliedVersion(pool)).toBe(expectedSchemaVersion());

    const rows = await pool.query('SELECT version, name, applied_at FROM schema_migrations ORDER BY version');
    expect(rows.rows.length).toBe(expectedSchemaVersion());
    expect(rows.rows[0].name).toMatch(/baseline/);
  });

  it('is idempotent — a second apply is a no-op', async () => {
    await applyMigrations(pool);
    const again = await applyMigrations(pool);
    expect(again.applied).toEqual([]);
    expect(await appliedVersion(pool)).toBe(expectedSchemaVersion());
  });
});

describe('verifySchemaVersion — the boot gate', () => {
  it('passes when the database is at the expected version', async () => {
    await applyMigrations(pool);
    await expect(verifySchemaVersion(pool)).resolves.toBeUndefined();
  });

  it('fails with a "run npm run setup" pointer when the database is behind', async () => {
    await applyMigrations(pool);
    await pool.query('DELETE FROM schema_migrations WHERE version = $1', [expectedSchemaVersion()]);
    await expect(verifySchemaVersion(pool)).rejects.toThrow(/npm run setup/);
    await applyMigrations(pool); // restore
  });

  it('fails with a "run npm run setup" pointer when schema_migrations is missing entirely', async () => {
    await pool.query('DROP TABLE IF EXISTS schema_migrations');
    await expect(verifySchemaVersion(pool)).rejects.toThrow(/npm run setup/);
    await applyMigrations(pool); // restore
  });

  it('fails loudly when the database is AHEAD of this build (older code, newer db)', async () => {
    await applyMigrations(pool);
    await pool.query(
      `INSERT INTO schema_migrations (version, name) VALUES ($1, 'from_the_future')`,
      [expectedSchemaVersion() + 1],
    );
    await expect(verifySchemaVersion(pool)).rejects.toThrow(/newer|ahead/i);
    await pool.query('DELETE FROM schema_migrations WHERE version = $1', [
      expectedSchemaVersion() + 1,
    ]);
  });
});

describe('initDb — runtime boot verifies, never applies DDL', () => {
  it('throws the setup pointer on an un-versioned database instead of self-provisioning', async () => {
    await pool.query('DROP TABLE IF EXISTS schema_migrations');
    await expect(initDb()).rejects.toThrow(/npm run setup/);
    await applyMigrations(pool); // restore for subsequent test files
  });

  it('succeeds once the database is at the expected version', async () => {
    await applyMigrations(pool);
    await expect(initDb()).resolves.toBeUndefined();
  });
});
