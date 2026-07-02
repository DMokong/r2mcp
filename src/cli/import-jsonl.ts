#!/usr/bin/env tsx
// OTel instrumentation MUST be imported first — before any other module —
// so OTEL_TRACEPARENT propagation has an SDK to attach the parent context to.
import '../instrumentation.js';

/**
 * claw-i6td.4 — JSONL backup import (restore).
 *
 * Usage:
 *   npm run db:import -- <file> [--dry-run]
 *
 * Replays an export produced by db:export. Idempotent: rows already present
 * (by PK or unique keys) are skipped, so re-running a restore is safe. Row
 * failures are reported and DO NOT abort the run. --dry-run parses and counts
 * without writing.
 *
 * Exit codes: 0 success (even with per-row skips), 1 fatal error OR any
 * per-row errors (so cron/scripts notice a partial restore).
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { initDb, getPool, closeDb } from '../db.js';
import { loadEnvFile } from '../env.js';
import { importFromLines } from '../backup/importer.js';

async function main() {
  const argv = process.argv.slice(2);
  const dryRun = argv.includes('--dry-run');
  const file = argv.find((a) => !a.startsWith('--'));
  if (!file) {
    process.stderr.write('Usage: npm run db:import -- <file> [--dry-run]\n');
    process.exit(1);
  }

  const lines = readFileSync(resolve(file), 'utf-8').split('\n');
  await initDb();
  const summary = await importFromLines(lines, { pool: getPool(), dryRun });
  process.stdout.write(JSON.stringify(summary, null, 2) + '\n');
  await closeDb();
  if (summary.errors.length > 0) process.exit(1);
}

const isMain =
  process.argv[1] &&
  resolve(process.argv[1]).replace(/\.(ts|js)$/, '') ===
    resolve(import.meta.dirname || '.', 'import-jsonl');

if (isMain) {
  // Load .env only on the CLI path — tests import modules, and a module-level
  // load would leak the consumer's R2MCP_DATABASE_URL into the test process
  // (claw-8cjf.2).
  loadEnvFile(resolve(process.env.PROJECT_ROOT || process.cwd(), '.env'));
  main().catch((err) => {
    process.stderr.write(`ERROR: ${err instanceof Error ? err.message : String(err)}\n`);
    process.exit(1);
  });
}
