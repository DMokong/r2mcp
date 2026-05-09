import { getPool, initDb, closeDb } from '../../src/db.js';
import { pickTestUrl } from '../test-db-guard.js';

export async function setupEdgesTestDb() {
  process.env.R2MCP_DATABASE_URL = pickTestUrl();
  await initDb();
  const pool = getPool();
  await pool.query('DELETE FROM memory_edges');
  await pool.query('DELETE FROM memories');
  return pool;
}

export async function teardownEdgesTestDb() {
  await closeDb();
}

export async function resetEdgesTestDb(pool: import('pg').Pool) {
  await pool.query('DELETE FROM memory_edges');
  await pool.query('DELETE FROM memories');
}

export async function insertTestMemory(
  pool: import('pg').Pool,
  content: string,
  type: string = 'context',
  topics: string[] = [],
): Promise<string> {
  const fingerprint = `test-${Math.random().toString(36).slice(2)}-${Date.now()}`;
  const tier =
    type === 'preference' || type === 'rejection' ? 'preferences' :
    type === 'relationship' ? 'conversations' : 'project-context';
  const res = await pool.query(
    `INSERT INTO memories (content, tier, type, topics, fingerprint)
     VALUES ($1, $2, $3, $4, $5) RETURNING id`,
    [content, tier, type, topics, fingerprint],
  );
  return res.rows[0].id;
}
