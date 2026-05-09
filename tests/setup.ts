import { getPool, initDb, closeDb } from '../src/db.js';
import { pickTestUrl } from './test-db-guard.js';

export async function setupTestDb() {
  process.env.R2MCP_DATABASE_URL = pickTestUrl();
  await initDb();
  const pool = getPool();
  await pool.query('DELETE FROM memories');
  return pool;
}

export async function teardownTestDb() {
  await closeDb();
}
