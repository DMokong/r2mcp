#!/usr/bin/env tsx
/**
 * SPEC-046 entity extractor CLI.
 *
 * Usage:
 *   npm run entities:extract -- [--since-days=N | --full] [--max-cost=USD]
 *                               [--provider=<name>] [--resume=<run_id>]
 *                               [--data-dir=PATH] [--context-top-n=N]
 *
 * Provider selection precedence (mirrors SPEC-043):
 *   1. --provider=claude-code|anthropic|openrouter
 *   2. R2MCP_CLASSIFIER_PROVIDER env var
 *   3. Auto-fallback (claude-code → anthropic → openrouter)
 *
 * Examples:
 *   npm run entities:extract -- --since-days=1 --max-cost=0.05
 *   npm run entities:extract -- --full --max-cost=1.00
 *   npm run entities:extract -- --resume=abc123
 *
 * Exit codes:
 *   0 — completed normally (including cap-reached and provider errors that
 *       finalize via run summary)
 *   1 — fatal error (DB unreachable, no provider configured, parse error in args, etc.)
 *   2 — invalid CLI argument combination
 */

import { initDb, getPool, closeDb } from '../src/db.js';
import { runExtractor } from '../src/entities/extractor.js';
import {
  selectProvider,
  isProviderName,
  ProviderUnavailableError,
  type ProviderName,
} from '../src/providers/index.js';

export interface CliArgs {
  sinceDays?: number;
  maxCostUsd: number;
  providerFlag?: ProviderName;
  resume?: string;
  full: boolean;
  dataDir: string;
  contextTopN: number;
}

// SPEC-046 R6: argv-parse errors must produce a non-zero exit with a clear
// message naming the offending flag(s). UsageError carries the exit code so
// main() can preserve the historical exit-2 contract while parseArgs stays
// pure & unit-testable.
export class UsageError extends Error {
  readonly exitCode: number;
  constructor(message: string, exitCode = 2) {
    super(message);
    this.name = 'UsageError';
    this.exitCode = exitCode;
  }
}

export function parseArgs(argv: string[]): CliArgs {
  const args: CliArgs = {
    maxCostUsd: Number(process.env.R2MCP_ENTITY_MAX_USD ?? '1.00'),
    dataDir: process.env.R2MCP_ENTITY_DATA_DIR ?? 'data',
    contextTopN: Number(process.env.R2MCP_ENTITY_CONTEXT_TOP_N ?? '100'),
    full: false,
  };
  for (const a of argv) {
    if (a === '--full') {
      args.full = true;
    } else if (a.startsWith('--since-days=')) {
      args.sinceDays = Number(a.split('=')[1]);
    } else if (a.startsWith('--max-cost=')) {
      args.maxCostUsd = Number(a.split('=')[1]);
    } else if (a.startsWith('--provider=')) {
      const raw = a.split('=')[1];
      if (!isProviderName(raw)) {
        throw new UsageError(
          `--provider must be one of claude-code|anthropic|openrouter, got ${raw}`,
        );
      }
      args.providerFlag = raw;
    } else if (a.startsWith('--resume=')) {
      args.resume = a.split('=')[1];
    } else if (a.startsWith('--data-dir=')) {
      args.dataDir = a.split('=')[1];
    } else if (a.startsWith('--context-top-n=')) {
      args.contextTopN = Number(a.split('=')[1]);
    }
  }
  if (args.full && args.sinceDays !== undefined) {
    throw new UsageError(
      'Error: --full and --since-days are mutually exclusive',
    );
  }
  return args;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  await initDb();
  const pool = getPool();

  const provider = await selectProvider({ flag: args.providerFlag });

  try {
    const summary = await runExtractor({
      client: pool,
      provider,
      dataDir: args.dataDir,
      maxCostUsd: args.maxCostUsd,
      contextTopN: args.contextTopN,
      sinceDays: args.sinceDays,
      full: args.full,
      resumeFrom: args.resume,
    });
    process.stdout.write(JSON.stringify(summary, null, 2) + '\n');
  } finally {
    await closeDb();
  }
}

// Only run main() when invoked as the script entry point. Importing parseArgs
// (e.g. from tests) must not boot the extractor.
const isDirectInvocation = (() => {
  if (!process.argv[1]) return false;
  try {
    return import.meta.url === new URL(`file://${process.argv[1]}`).href;
  } catch {
    return false;
  }
})();

if (isDirectInvocation) {
  main().catch((err) => {
    if (err instanceof UsageError) {
      process.stderr.write(`${err.message}\n`);
      process.exit(err.exitCode);
    }
    if (err instanceof ProviderUnavailableError) {
      process.stderr.write(`${err.message}\n`);
    } else {
      process.stderr.write(`ERROR: ${err instanceof Error ? err.message : String(err)}\n`);
    }
    process.exit(1);
  });
}
