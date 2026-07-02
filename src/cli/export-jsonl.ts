#!/usr/bin/env tsx
// OTel instrumentation MUST be imported first — before any other module —
// so OTEL_TRACEPARENT propagation has an SDK to attach the parent context to.
import '../instrumentation.js';

/**
 * claw-i6td.4 — JSONL backup export.
 *
 * Usage:
 *   npm run db:export -- [--out=<file>] [--scope=<name>]
 *
 * Default output is stdout (pipe or redirect it); --out writes a file.
 * Default coverage is ALL scopes — pass --scope to narrow. See
 * README "Operations" for the restore drill and suggested cadence.
 *
 * Exit codes: 0 success, 1 fatal error.
 */

import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { initDb, getPool, closeDb } from '../db.js';
import { loadEnvFile } from '../env.js';
import { exportToLines, type ExportHeader } from '../backup/exporter.js';

interface CliArgs {
  out?: string;
  scope?: string;
}

function parseArgs(argv: string[]): CliArgs {
  const out: CliArgs = {};
  for (const arg of argv) {
    if (arg.startsWith('--out=')) out.out = arg.slice('--out='.length);
    else if (arg.startsWith('--scope=')) out.scope = arg.slice('--scope='.length);
    else throw new Error(`unknown argument: ${arg}`);
  }
  return out;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  await initDb();
  const lines = await exportToLines(getPool(), { scope: args.scope });
  const header = JSON.parse(lines[0]) as ExportHeader;

  const body = lines.join('\n') + '\n';
  if (args.out) {
    writeFileSync(resolve(args.out), body, 'utf-8');
    // Summary to stderr so stdout stays clean for piping in both modes.
    process.stderr.write(
      `exported ${JSON.stringify(header.counts)} scope=${header.scope ?? 'ALL'} -> ${args.out}\n`,
    );
  } else {
    process.stdout.write(body);
    process.stderr.write(
      `exported ${JSON.stringify(header.counts)} scope=${header.scope ?? 'ALL'}\n`,
    );
  }
  await closeDb();
}

const isMain =
  process.argv[1] &&
  resolve(process.argv[1]).replace(/\.(ts|js)$/, '') ===
    resolve(import.meta.dirname || '.', 'export-jsonl');

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
