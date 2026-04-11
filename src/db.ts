import pg from 'pg';
import pgvector from 'pgvector/pg';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));

let pool: pg.Pool | null = null;

export function getPool(): pg.Pool {
  if (!pool) {
    pool = new pg.Pool({
      connectionString: process.env.R2MCP_DATABASE_URL || 'postgresql://localhost:5432/r2mcp',
    });
  }
  return pool;
}

export async function initDb(): Promise<void> {
  const p = getPool();

  // pgvector.registerTypes requires a client (not pool) for setTypeParser
  const client = await p.connect();
  try {
    await pgvector.registerTypes(client);
  } finally {
    client.release();
  }

  const schema = readFileSync(join(__dirname, 'schema.sql'), 'utf-8');
  await p.query(schema);
}

export async function closeDb(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = null;
  }
}
