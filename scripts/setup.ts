/**
 * r2mcp setup script — idempotent schema provisioner.
 *
 * Usage: npm run setup
 *
 * What it does:
 * 1. Connects to DATABASE_URL
 * 2. Enables the pgvector extension
 * 3. Runs schema.sql (CREATE TABLE IF NOT EXISTS + CREATE INDEX IF NOT EXISTS)
 * 4. Verifies the schema by running a quick sanity query
 *
 * Safe to re-run: all DDL uses IF NOT EXISTS / IF EXISTS. No data is modified.
 */

import pg from 'pg';
import pgvector from 'pgvector/pg';
import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Load .env from project root
const envPath = resolve(__dirname, '..', '.env');
if (existsSync(envPath)) {
  const envContent = readFileSync(envPath, 'utf-8');
  for (const line of envContent.split('\n')) {
    const match = line.match(/^([A-Z_]+)=(.+)$/);
    if (match && !process.env[match[1]]) {
      process.env[match[1]] = match[2].trim();
    }
  }
}

const DATABASE_URL = process.env.DATABASE_URL || 'postgresql://localhost:5432/r2mcp';

async function setup() {
  console.log('r2mcp setup — provisioning database schema...');
  console.log(`Connecting to: ${DATABASE_URL.replace(/:[^:@]+@/, ':***@')}`);

  const pool = new pg.Pool({ connectionString: DATABASE_URL });
  const client = await pool.connect();

  try {
    // 1. Enable pgvector
    console.log('→ Enabling pgvector extension...');
    await client.query('CREATE EXTENSION IF NOT EXISTS vector');
    console.log('  ✓ pgvector enabled');

    // 2. Register pgvector types
    await pgvector.registerTypes(client);

    // 3. Run schema.sql
    const schemaPath = resolve(__dirname, '..', 'src', 'schema.sql');
    const schema = readFileSync(schemaPath, 'utf-8');
    console.log('→ Applying schema.sql...');
    await client.query(schema);
    console.log('  ✓ Schema applied (idempotent)');

    // 4. Sanity check
    const result = await client.query(`
      SELECT
        (SELECT COUNT(*) FROM information_schema.tables WHERE table_name = 'memories')::int AS table_exists,
        (SELECT COUNT(*) FROM pg_indexes WHERE tablename = 'memories')::int AS index_count
    `);
    const { table_exists, index_count } = result.rows[0];

    if (table_exists !== 1) {
      throw new Error('memories table was not created — schema.sql may have failed silently');
    }

    console.log(`  ✓ memories table present, ${index_count} indexes`);
    console.log('\n✅ r2mcp setup complete!');
    console.log('\nNext steps:');
    console.log('  1. Add to .mcp.json:');
    console.log('     "memory": {');
    console.log('       "command": "node",');
    console.log('       "args": ["<path-to-r2mcp>/dist/index.js"],');
    console.log('       "env": { "DATABASE_URL": "<your-url>", "OPENROUTER_API_KEY": "<your-key>" }');
    console.log('     }');
    console.log('  2. Build: npm run build');
    console.log('  3. Restart Claude Code to pick up the new MCP server');

  } finally {
    client.release();
    await pool.end();
  }
}

setup().catch((err) => {
  console.error('\n❌ Setup failed:', err.message);
  console.error('\nTroubleshooting:');
  console.error('  - Check DATABASE_URL is set correctly in .env');
  console.error('  - Ensure PostgreSQL is running (try: docker compose up -d)');
  console.error('  - Ensure the database exists (try: createdb r2mcp)');
  process.exit(1);
});
