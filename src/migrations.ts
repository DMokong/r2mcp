/**
 * Versioned schema migrations (claw-i6td.5).
 *
 * Layout: src/migrations/NNN_name.sql, numbered contiguously from 001.
 * 001_baseline.sql is the former schema.sql — fully idempotent DDL, so an
 * existing pre-migration deployment "adopts" the system with a no-op apply
 * that simply records version 1.
 *
 * Split of responsibilities:
 *   - `applyMigrations` — DDL writer. Called by `npm run setup` and the test
 *     harness ONLY. Takes an advisory lock so concurrent setups can't race.
 *   - `verifySchemaVersion` — read-only gate called from `initDb()` on every
 *     runtime boot (MCP server + every CLI). Fails fast with a "run
 *     npm run setup" pointer instead of executing DDL at runtime, which both
 *     drops the owner-privilege requirement at runtime and makes room for the
 *     first non-additive migration.
 */

import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import type pg from 'pg';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DEFAULT_MIGRATIONS_DIR = join(__dirname, 'migrations');

/** Stable app-wide advisory lock key for migration application. */
const MIGRATION_LOCK_KEY = 0x72326d63; // 'r2mc'

export interface Migration {
  version: number;
  name: string;
  file: string;
  sql: string;
}

export interface ApplyResult {
  applied: Array<{ version: number; name: string }>;
  from: number;
  to: number;
}

/**
 * Read the bundled migrations, validated: NNN_name.sql, no duplicate versions,
 * contiguous ascending from 1 (a gap means a migration was lost in packaging —
 * refuse to guess).
 */
export function listMigrations(dir: string = DEFAULT_MIGRATIONS_DIR): Migration[] {
  const entries = readdirSync(dir).filter((f) => f.endsWith('.sql'));
  const migrations: Migration[] = [];
  for (const file of entries) {
    const m = file.match(/^(\d{3})_(.+)\.sql$/);
    if (!m) throw new Error(`migration filename '${file}' must match NNN_name.sql`);
    migrations.push({
      version: parseInt(m[1], 10),
      name: m[2],
      file,
      sql: readFileSync(join(dir, file), 'utf-8'),
    });
  }
  migrations.sort((a, b) => a.version - b.version);
  for (let i = 0; i < migrations.length; i++) {
    if (migrations[i].version === migrations[i - 1]?.version) {
      throw new Error(`duplicate migration version ${migrations[i].version}`);
    }
    if (migrations[i].version !== i + 1) {
      throw new Error(
        `migrations must be contiguous from 001 — found version ${migrations[i].version} at position ${i + 1} (gap or missing file)`,
      );
    }
  }
  if (migrations.length === 0) throw new Error(`no migrations found in ${dir}`);
  return migrations;
}

/** The version a database must be at for this build to boot. */
export function expectedSchemaVersion(): number {
  const migrations = listMigrations();
  return migrations[migrations.length - 1].version;
}

/** Highest applied version, or 0 when the table is missing/empty (pre-adoption). */
export async function appliedVersion(pool: pg.Pool): Promise<number> {
  const exists = await pool.query(
    `SELECT 1 FROM information_schema.tables WHERE table_name = 'schema_migrations'`,
  );
  if (exists.rows.length === 0) return 0;
  const r = await pool.query(`SELECT COALESCE(MAX(version), 0)::int AS v FROM schema_migrations`);
  return r.rows[0].v as number;
}

/**
 * Apply all pending migrations, each in its own transaction, recording a
 * schema_migrations row per migration. Safe to re-run (pending-only) and safe
 * to run concurrently (advisory lock serializes appliers).
 */
export async function applyMigrations(pool: pg.Pool): Promise<ApplyResult> {
  const migrations = listMigrations();
  const client = await pool.connect();
  const applied: ApplyResult['applied'] = [];
  try {
    await client.query(`SELECT pg_advisory_lock($1)`, [MIGRATION_LOCK_KEY]);
    await client.query(
      `CREATE TABLE IF NOT EXISTS schema_migrations (
         version    INTEGER PRIMARY KEY,
         name       TEXT NOT NULL,
         applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
       )`,
    );
    const fromRes = await client.query(
      `SELECT COALESCE(MAX(version), 0)::int AS v FROM schema_migrations`,
    );
    const from = fromRes.rows[0].v as number;

    for (const migration of migrations) {
      if (migration.version <= from) continue;
      try {
        await client.query('BEGIN');
        await client.query(migration.sql);
        await client.query(`INSERT INTO schema_migrations (version, name) VALUES ($1, $2)`, [
          migration.version,
          migration.name,
        ]);
        await client.query('COMMIT');
        applied.push({ version: migration.version, name: migration.name });
      } catch (err) {
        await client.query('ROLLBACK');
        throw new Error(
          `migration ${migration.file} failed (rolled back): ${(err as Error).message}`,
          { cause: err },
        );
      }
    }
    return { applied, from, to: applied.length ? applied[applied.length - 1].version : from };
  } finally {
    await client.query(`SELECT pg_advisory_unlock($1)`, [MIGRATION_LOCK_KEY]).catch(() => {});
    client.release();
  }
}

/**
 * Read-only boot gate. Throws with a fix pointer when the database is behind
 * (or pre-adoption), and refuses to run against a database that is AHEAD of
 * this build — an older binary must not write into a newer schema.
 */
export async function verifySchemaVersion(pool: pg.Pool): Promise<void> {
  const expected = expectedSchemaVersion();
  const actual = await appliedVersion(pool);
  if (actual === expected) return;
  if (actual > expected) {
    throw new Error(
      `database schema version ${actual} is newer than this build expects (${expected}) — ` +
        `upgrade r2mcp (older code must not run ahead of the schema).`,
    );
  }
  throw new Error(
    `database schema version ${actual} is behind the expected ${expected} — run: npm run setup\n` +
      `(r2mcp no longer executes DDL at boot; setup applies the bundled numbered migrations.)`,
  );
}
