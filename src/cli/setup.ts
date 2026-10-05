#!/usr/bin/env node
/**
 * r2mcp setup script — idempotent schema provisioner.
 *
 * Usage: npm run setup
 *
 * What it does:
 * 1. Connects to R2MCP_DATABASE_URL
 * 2. Enables the pgvector extension
 * 3. Applies pending numbered migrations (src/migrations/NNN_name.sql) and
 *    records them in schema_migrations (claw-i6td.5)
 * 4. Verifies the schema by running a quick sanity query
 *
 * Safe to re-run: pending-only + advisory-locked. No data is modified.
 */

import pg from 'pg';
import pgvector from 'pgvector/pg';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateDatabaseUrl, classifySetupError, redactDatabaseUrl } from './setup-helpers.js';
import { loadEnvFile } from '../env.js';
import { MISSING_DATABASE_URL_MESSAGE } from '../db.js';
import { applyMigrations } from '../migrations.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Load .env from project root
loadEnvFile(resolve(__dirname, '..', '..', '.env'));

// claw-8cjf.2: fail fast instead of defaulting to a credential-less localhost
// URL that matches neither the Docker compose setup nor any hosted option.
if (!process.env.R2MCP_DATABASE_URL) {
  console.error(`\n❌ ${MISSING_DATABASE_URL_MESSAGE}`);
  process.exit(1);
}
const R2MCP_DATABASE_URL = process.env.R2MCP_DATABASE_URL;

async function setup() {
  const redactedUrl = redactDatabaseUrl(R2MCP_DATABASE_URL);

  try {
    validateDatabaseUrl(R2MCP_DATABASE_URL);
  } catch (validationErr) {
    console.error(`\n❌ Invalid database URL: ${redactedUrl}`);
    console.error((validationErr as Error).message);
    process.exit(1);
  }

  console.log('r2mcp setup — provisioning database schema...');
  console.log(`Connecting to: ${redactedUrl}`);

  const pool = new pg.Pool({ connectionString: R2MCP_DATABASE_URL });
  const client = await pool.connect();

  try {
    // 1. Enable pgvector
    console.log('→ Enabling pgvector extension...');
    await client.query('CREATE EXTENSION IF NOT EXISTS vector');
    console.log('  ✓ pgvector enabled');

    // 2. Register pgvector types
    await pgvector.registerTypes(client);

    // 3. Apply numbered migrations (claw-i6td.5). Pending-only + advisory-
    //    locked; an existing pre-migration deployment adopts via the
    //    idempotent 001_baseline and simply gets its version recorded.
    console.log('→ Applying migrations...');
    const applyResult = await applyMigrations(pool);
    if (applyResult.applied.length === 0) {
      console.log(`  ✓ Already at schema version ${applyResult.to} — nothing to apply`);
    } else {
      for (const m of applyResult.applied) console.log(`  ✓ applied ${m.version} (${m.name})`);
      console.log(`  ✓ Schema now at version ${applyResult.to}`);
    }

    // 4. Sanity check
    const result = await client.query(`
      SELECT
        (SELECT COUNT(*) FROM information_schema.tables WHERE table_name = 'memories')::int AS table_exists,
        (SELECT COUNT(*) FROM pg_indexes WHERE tablename = 'memories')::int AS index_count
    `);
    const { table_exists, index_count } = result.rows[0];

    if (table_exists !== 1) {
      throw new Error(
        'memories table was not created — the baseline migration may have failed silently',
      );
    }

    console.log(`  ✓ memories table present, ${index_count} indexes`);
    console.log('\n✅ r2mcp setup complete!');
    console.log('\nNext steps:');
    console.log('  1. Add to .mcp.json:');
    console.log('     "memory": {');
    console.log('       "command": "npx",');
    console.log('       "args": ["-y", "r2mcp"],');
    console.log(
      '       "env": { "R2MCP_DATABASE_URL": "<your-url>", "R2MCP_OPENROUTER_API_KEY": "<your-key>", "R2MCP_SCOPE": "<project-name>" }',
    );
    console.log('     }');
    console.log(
      '     (from a repo clone instead: "command": "node", "args": ["<path>/dist/index.js"] after npm run build)',
    );
    console.log('  2. Restart Claude Code to pick up the new MCP server');
  } finally {
    client.release();
    await pool.end();
  }
}

setup().catch((err) => {
  const redactedUrl = redactDatabaseUrl(R2MCP_DATABASE_URL);
  // pg library always throws Error instances; cast is safe
  const { cause, fix } = classifySetupError(err as Error, redactedUrl);
  console.error('\n❌ Setup failed');
  console.error(`\nCause: ${cause}`);
  console.error(`Fix:   ${fix}`);
  process.exit(1);
});
