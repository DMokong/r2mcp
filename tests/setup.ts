import { getPool, initDb, closeDb } from '../src/db.js';
import { applyMigrations } from '../src/migrations.js';
import { pickTestUrl } from './test-db-guard.js';

export async function setupTestDb() {
  process.env.R2MCP_DATABASE_URL = pickTestUrl();
  // Tests provision themselves: apply migrations (pending-only, cheap when
  // current), then initDb verifies — the same gate production boots go through.
  await applyMigrations(getPool());
  await initDb();
  const pool = getPool();
  await pool.query('DELETE FROM memories');
  return pool;
}

export async function teardownTestDb() {
  await closeDb();
}
