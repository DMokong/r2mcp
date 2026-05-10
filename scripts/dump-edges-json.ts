#!/usr/bin/env tsx
/**
 * Phase 0b sidecar CLI — dump memory_edges + memories to JSON.
 *
 * Production callers should use the MCP tool `dump_edges_sidecar` instead.
 * This script remains as the dev workflow entry point:
 *   tsx scripts/dump-edges-json.ts --out-dir=memory/compiled
 */
import { resolve } from 'node:path';
import { dumpEdgesJson } from '../src/tools/dump-edges-sidecar.js';

const DEFAULT_DIR = 'memory/compiled';

async function main() {
  const dirArg = process.argv.find((a) => a.startsWith('--out-dir='));
  const outDir = resolve(dirArg ? dirArg.split('=')[1] : DEFAULT_DIR);
  const result = await dumpEdgesJson(outDir);
  console.log(`Wrote ${result.edges_count} edges + ${result.memories_count} memories to ${result.out_dir}/`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
