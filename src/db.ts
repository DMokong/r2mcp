import pg from 'pg';
import pgvector from 'pgvector/pg';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));

let pool: pg.Pool | null = null;

/**
 * claw-8cjf.2: refuse to guess a database. The old localhost fallback sent
 * writes to the wrong database on misconfiguration and helped nobody — the
 * Docker default is a different URL anyway (r2mcp:r2mcp@localhost, not bare).
 */
export const MISSING_DATABASE_URL_MESSAGE =
  'R2MCP_DATABASE_URL is not set. r2mcp refuses to guess a database. Set it via:\n' +
  '  • .mcp.json: add R2MCP_DATABASE_URL to the server\'s "env" block (recommended), or\n' +
  '  • .env in the project root: R2MCP_DATABASE_URL=postgresql://...\n' +
  'For local Docker (docker compose up -d, then npm run setup) use:\n' +
  '  postgresql://r2mcp:r2mcp@localhost:5432/r2mcp';

export function getPool(): pg.Pool {
  if (!pool) {
    const connectionString = process.env.R2MCP_DATABASE_URL;
    if (!connectionString) {
      throw new Error(MISSING_DATABASE_URL_MESSAGE);
    }
    pool = new pg.Pool({ connectionString });
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
