#!/usr/bin/env node
/**
 * Phase 0b sidecar (claw-8dgu): dump memory_edges + memories as JSON for
 * downstream consumers (memory-ui force graph, /memory-doctor, etc.).
 *
 * Output: memory/compiled/{edges,memories}.json — same dir as compile-wiki.ts
 * output, gitignored.
 *
 * Usage:
 *   node --env-file=.env scripts/dump-edges-json.mjs [--out-dir=PATH]
 */
import pg from 'pg';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';

const DEFAULT_DIR = 'memory/compiled';

async function main() {
  const url = process.env.R2MCP_DATABASE_URL;
  if (!url) {
    console.error('R2MCP_DATABASE_URL not set');
    process.exit(1);
  }
  const dirArg = process.argv.find(a => a.startsWith('--out-dir='));
  const outDir = resolve(dirArg ? dirArg.split('=')[1] : DEFAULT_DIR);

  const c = new pg.Client({ connectionString: url });
  await c.connect();
  try {
    const edges = await c.query(`
      SELECT id, from_memory_id, to_memory_id, relation, confidence, rationale,
             classifier_version, valid_from, valid_until, created_at, updated_at
      FROM memory_edges
      WHERE valid_until IS NULL
      ORDER BY created_at DESC
    `);
    const memories = await c.query(`
      SELECT id, content, tier, type, section, topics, people, date, fingerprint,
             source_file, source_line, created_at, updated_at
      FROM memories
      WHERE type != 'archived'
      ORDER BY created_at DESC
    `);

    await mkdir(outDir, { recursive: true });

    const generatedAt = new Date().toISOString();
    const edgesOut = {
      generated_at: generatedAt,
      memory_count: memories.rows.length,
      edge_count: edges.rows.length,
      edges: edges.rows,
    };
    const memoriesOut = {
      generated_at: generatedAt,
      memory_count: memories.rows.length,
      memories: memories.rows,
    };

    await writeFile(join(outDir, 'edges.json'), JSON.stringify(edgesOut, null, 2), 'utf-8');
    await writeFile(join(outDir, 'memories.json'), JSON.stringify(memoriesOut, null, 2), 'utf-8');

    console.log(`Wrote ${edges.rows.length} edges + ${memories.rows.length} memories to ${outDir}/`);
  } finally {
    await c.end();
  }
}

main().catch(e => { console.error(e); process.exit(1); });
