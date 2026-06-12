#!/usr/bin/env tsx
/**
 * SPEC-044 Section C — lint CLI driver.
 *
 * Usage:
 *   npm run lint -- [--check=<name>] [--since=Nd] [--limit=N] [--fix]
 *
 * Output: human-readable terminal report grouped by check type, with a
 * trailing JSON summary line for programmatic consumption (mirrors the
 * pattern of classify-edges and compile-wiki).
 *
 * Exit codes:
 *   0 — completed normally (regardless of finding count)
 *   1 — fatal error (DB unreachable, malformed input)
 */

import { resolve } from 'node:path';
import { initDb, getPool, closeDb } from '../src/db.js';
import { loadEnvFile } from '../src/env.js';
import { runLint } from '../src/lint/run.js';
import { ALL_CHECKS, type CheckName, type LintInput } from '../src/lint/types.js';

// Load .env from project root — mirrors src/index.ts (claw-8cjf.2; this CLI
// previously loaded no environment at all and silently hit the default URL).
loadEnvFile(resolve(process.env.PROJECT_ROOT || process.cwd(), '.env'));

type CliArgs = LintInput;

function isCheck(s: string): s is CheckName {
  return (ALL_CHECKS as ReadonlyArray<string>).includes(s);
}

function parseArgs(argv: string[]): CliArgs {
  const out: CliArgs = {};
  for (const arg of argv) {
    if (arg === '--fix') out.fix = true;
    else if (arg.startsWith('--check=')) {
      const c = arg.split('=')[1];
      if (!isCheck(c)) throw new Error(`--check must be one of ${ALL_CHECKS.join('|')}, got ${c}`);
      out.check = c;
    } else if (arg.startsWith('--since=')) {
      const raw = arg.split('=')[1];
      const m = raw.match(/^(\d+)d$/);
      if (!m) throw new Error(`--since must be Nd (e.g. 30d), got ${raw}`);
      out.since_days = Number(m[1]);
    } else if (arg.startsWith('--limit=')) {
      out.limit = Number(arg.split('=')[1]);
    }
  }
  return out;
}

function renderReport(result: Awaited<ReturnType<typeof runLint>>): string {
  const lines: string[] = [];
  lines.push('Lint Report');
  lines.push('===========');
  lines.push(`Total findings: ${result.summary.total_findings}`);
  for (const [check, count] of Object.entries(result.summary.by_check)) {
    lines.push(`  ${check}: ${count}`);
  }
  // Per-check sections (C.AC3)
  for (const checkName of ALL_CHECKS) {
    const subset = result.findings.filter((f) => f.check === checkName);
    if (subset.length === 0) continue;
    lines.push('');
    lines.push(`## ${checkName}`);
    for (const f of subset) {
      lines.push(`  - ${f.memory_id}${f.related_memory_id ? ` ↔ ${f.related_memory_id}` : ''}`);
      lines.push(`      action: ${f.suggested_action} (confidence ${f.confidence.toFixed(2)})`);
      lines.push(`      ${f.rationale}`);
    }
  }
  if (result.fixes_applied && result.fixes_applied.length > 0) {
    lines.push('');
    lines.push(`Fixes applied (${result.fixes_applied.length}):`);
    for (const fx of result.fixes_applied) {
      lines.push(`  - ${fx.memory_id}: ${fx.action}`);
    }
  }
  return lines.join('\n');
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  await initDb();
  const result = await runLint(args, getPool());
  process.stdout.write(renderReport(result) + '\n');
  process.stdout.write('---\n');
  process.stdout.write(JSON.stringify(result, null, 2) + '\n');
  await closeDb();
  process.exit(0);
}

main().catch((err) => {
  process.stderr.write(`ERROR: ${err instanceof Error ? err.message : String(err)}\n`);
  process.exit(1);
});
