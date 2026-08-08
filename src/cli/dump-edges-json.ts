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

const DEFAULT_DIR = 'memory/compiled';

async function main() {
  // Load .env from project root — launchd-spawned subprocesses don't inherit the
  // shell env, so R2MCP_DATABASE_URL must be loaded here. Matches classify-edges
  // and extract-entities, which already do this; this CLI was missing it, so a
  // direct `tsx dump-edges-json.ts` failed with "R2MCP_DATABASE_URL not set".
  //
  // claw-8cjf.2: this call MUST stay inside the CLI entry guard. At module level
  // it fires on import, so any test importing this file pulls the PROD Supabase
  // URL from .env into the vitest process.
  loadEnvFile(resolve(process.env.PROJECT_ROOT || process.cwd(), '.env'));

  const dirArg = process.argv.find((a) => a.startsWith('--out-dir='));
  // claw-z8k8: default is the current scope + global; --all-scopes restores the
  // pre-0.3.1 behavior of dumping every scope into one file.
  const allScopes = process.argv.includes('--all-scopes');
  const outDir = resolve(dirArg ? dirArg.split('=')[1] : DEFAULT_DIR);
  const result = await dumpEdgesJson(outDir, { all_scopes: allScopes });
  console.log(
    `Wrote ${result.edges_count} edges + ${result.memories_count} memories to ${result.out_dir}/`,
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
