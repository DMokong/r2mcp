import pg from 'pg';
import pgvector from 'pgvector/pg';
import { verifySchemaVersion } from './migrations.js';

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

/**
 * Version-free connection: pool + pgvector type registration, NO schema-version
 * gate. For tools that must work against a behind-version database — above all
 * `db:export`, because the moment you most need a backup is right before an
 * upgrade or from an old database. Everything else boots via initDb().
 */
export async function connectDb(): Promise<void> {
  const p = getPool();

  // DATE (OID 1082) has no time component, so the wire string 'YYYY-MM-DD' is
  // already the correct representation. node-pg's default parser instead builds
  // a JS Date at LOCAL midnight, which any east-of-UTC timezone then reads back
  // a day early once serialised. Identity parser sidesteps the lossy round-trip.
  pg.types.setTypeParser(1082, (v) => v);

  // pgvector.registerTypes requires a client (not pool) for setTypeParser
  const client = await p.connect();
  try {
    await pgvector.registerTypes(client);
  } finally {
    client.release();
  }
}

/**
 * Runtime boot: register pgvector types and VERIFY the schema version.
 * claw-i6td.5: boot no longer executes DDL — `npm run setup` applies the
 * bundled numbered migrations; initDb fails fast with that pointer when the
 * database is behind. Drops the owner-privilege requirement at runtime and
 * makes non-additive migrations expressible.
 */
export async function initDb(): Promise<void> {
  await connectDb();
  await verifySchemaVersion(getPool());
}

export async function closeDb(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = null;
  }
}
