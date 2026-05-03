#!/usr/bin/env node
/**
 * One-shot DB→DB migration: cindy_memory (localhost:5433) → Supabase (current .env).
 *
 * Preserves fingerprints so re-runs are idempotent (ON CONFLICT DO NOTHING).
 * Preserves embeddings if present in source; degrades to NULL otherwise.
 * Also migrates memory_edges if the source has the table (SPEC-043 era).
 *
 * Usage:
 *   node --env-file=.env scripts/migrate-cindy-to-supabase.mjs [--dry-run]
 */
import pg from 'pg';

const SOURCE_URL = 'postgresql://cindy:cindy@localhost:5433/cindy_memory';
const TARGET_URL = process.env.R2MCP_DATABASE_URL;
const DRY_RUN = process.argv.includes('--dry-run');

if (!TARGET_URL) { console.error('R2MCP_DATABASE_URL not set'); process.exit(1); }

const src = new pg.Client({ connectionString: SOURCE_URL });
const dst = new pg.Client({ connectionString: TARGET_URL, ssl: { rejectUnauthorized: false } });
await src.connect();
await dst.connect();

const srcCols = (await src.query(
  `SELECT column_name FROM information_schema.columns WHERE table_name = 'memories' ORDER BY ordinal_position`
)).rows.map(r => r.column_name);
const dstCols = (await dst.query(
  `SELECT column_name FROM information_schema.columns WHERE table_name = 'memories' ORDER BY ordinal_position`
)).rows.map(r => r.column_name);
const sharedCols = srcCols.filter(c => dstCols.includes(c) && c !== 'tsv');
console.log(`Shared columns: ${sharedCols.join(', ')}`);

const memSrc = await src.query(
  `SELECT ${sharedCols.map(c => c === 'embedding' ? `embedding::text AS embedding` : c).join(', ')}
   FROM memories WHERE type != 'archived'`,
);
console.log(`Source memories to migrate: ${memSrc.rows.length}`);

const fps = memSrc.rows.map(r => r.fingerprint);
const collisions = await dst.query(
  `SELECT fingerprint FROM memories WHERE fingerprint = ANY($1)`,
  [fps],
);
console.log(`Already-present fingerprints in target: ${collisions.rows.length}`);
const toInsert = memSrc.rows.length - collisions.rows.length;
console.log(`Net new memories to insert: ${toInsert}`);

if (DRY_RUN) {
  console.log('[dry-run] no writes performed');
  await src.end(); await dst.end();
  process.exit(0);
}

let inserted = 0, skipped = 0;
const colList = sharedCols.join(', ');
const placeholders = sharedCols.map((_, i) => `$${i + 1}`).join(', ');
for (const row of memSrc.rows) {
  const values = sharedCols.map(c => row[c]);
  try {
    const res = await dst.query(
      `INSERT INTO memories (${colList}) VALUES (${placeholders}) ON CONFLICT (fingerprint) DO NOTHING RETURNING id`,
      values,
    );
    if (res.rowCount > 0) inserted++; else skipped++;
  } catch (e) {
    console.error(`Failed to insert (fp=${row.fingerprint}): ${e.message}`);
    skipped++;
  }
}
console.log(`memories: inserted=${inserted}, skipped=${skipped}`);

const hasEdges = (await src.query(`SELECT to_regclass('public.memory_edges') IS NOT NULL AS has`)).rows[0].has;
if (hasEdges) {
  const edgeCols = (await src.query(
    `SELECT column_name FROM information_schema.columns WHERE table_name = 'memory_edges' ORDER BY ordinal_position`
  )).rows.map(r => r.column_name);
  const edgesSrc = await src.query(`SELECT ${edgeCols.join(', ')} FROM memory_edges`);
  console.log(`Source memory_edges: ${edgesSrc.rows.length}`);
  if (edgesSrc.rows.length > 0) {
    const ecolList = edgeCols.join(', ');
    const ePlace = edgeCols.map((_, i) => `$${i + 1}`).join(', ');
    let einserted = 0, eskipped = 0;
    for (const row of edgesSrc.rows) {
      const values = edgeCols.map(c => row[c]);
      try {
        const res = await dst.query(
          `INSERT INTO memory_edges (${ecolList}) VALUES (${ePlace}) ON CONFLICT (from_memory_id, to_memory_id, relation) DO NOTHING RETURNING id`,
          values,
        );
        if (res.rowCount > 0) einserted++; else eskipped++;
      } catch (e) {
        eskipped++;
      }
    }
    console.log(`memory_edges: inserted=${einserted}, skipped=${eskipped}`);
  }
} else {
  console.log('Source has no memory_edges table — skipping edges migration.');
}

await src.end();
await dst.end();
console.log('done.');
