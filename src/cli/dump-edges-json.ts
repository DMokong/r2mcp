#!/usr/bin/env tsx
/**
 * Phase 0b sidecar CLI — dump memory_edges + memories to JSON.
 *
 * Production callers should use the MCP tool `dump_edges_sidecar` instead.
 * This script remains as the dev workflow entry point:
 *   tsx scripts/dump-edges-json.ts --out-dir=memory/compiled
 */
import { resolve } from 'node:path';
import { dumpEdgesJson } from '../tools/dump-edges-sidecar.js';
import { loadEnvFile } from '../env.js';

// Load .env from project root — launchd-spawned subprocesses don't inherit the
// shell env, so R2MCP_DATABASE_URL must be loaded here. Matches classify-edges
// and extract-entities, which already do this; this CLI was missing it, so a
// direct `tsx dump-edges-json.ts` failed with "R2MCP_DATABASE_URL not set".
loadEnvFile(resolve(process.env.PROJECT_ROOT || process.cwd(), '.env'));

const DEFAULT_DIR = 'memory/compiled';

async function main() {
  const dirArg = process.argv.find((a) => a.startsWith('--out-dir='));
  const outDir = resolve(dirArg ? dirArg.split('=')[1] : DEFAULT_DIR);
  const result = await dumpEdgesJson(outDir);
  console.log(
    `Wrote ${result.edges_count} edges + ${result.memories_count} memories to ${result.out_dir}/`,
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
