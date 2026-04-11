import { getPool, initDb, closeDb } from '../src/db.js';

export async function setupTestDb() {
  process.env.R2MCP_DATABASE_URL = process.env.R2MCP_DATABASE_URL || 'postgresql://localhost:5432/r2mcp_test';
  await initDb();
  const pool = getPool();
  await pool.query('DELETE FROM memories');
  return pool;
}

export async function teardownTestDb() {
  await closeDb();
}
