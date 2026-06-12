#!/usr/bin/env tsx
// OTel instrumentation MUST be imported first — before any other module —
// so OTEL_TRACEPARENT propagation has an SDK to attach the parent context to
// (claw-1ejd). Without this import, propagation.extract() is a no-op.
import '../instrumentation.js';

/**
 * SPEC-043 / SPEC-044 edge classifier CLI.
 *
 * Usage:
 *   npm run edges:classify -- [--since=DURATION] [--max-cost=USD] [--dry-run] [--resume=<run_id>] [--provider=<name>]
 *
 * Provider selection precedence (D.R3):
 *   1. --provider=claude-code|anthropic|openrouter
 *   2. R2MCP_CLASSIFIER_PROVIDER env var
 *   3. Auto-fallback (claude-code → anthropic → openrouter)
 *
 * Examples:
 *   npm run edges:classify -- --dry-run                       # estimate only
 *   npm run edges:classify -- --max-cost=5.00                 # full run, $5 cap
 *   npm run edges:classify -- --since=7d --max-cost=1.00      # incremental
 *   npm run edges:classify -- --resume=abc123                 # continue prior run
 *   npm run edges:classify -- --provider=claude-code          # force Max-covered
 *
 * Exit codes:
 *   0 — completed normally OR hit cap gracefully OR dry-run completed
 *   1 — fatal error (DB unreachable, no provider configured, etc.)
 */

import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { initDb, getPool, closeDb } from '../db.js';
import { findCandidatePairs } from '../edges/candidate-pairs.js';
import { stage1HaikuFilter } from '../edges/stage1-haiku.js';
import { stage2OpusClassify, type MemoryForClassify } from '../edges/stage2-opus.js';
import { StateStore, RunSummaryWriter } from '../edges/state.js';
import { runClassifier } from '../edges/classifier.js';
import type { EdgeRelation } from '../edges/types.js';
import { withToolSpan } from '../telemetry.js';
import {
  selectProvider,
  isProviderName,
  ProviderUnavailableError,
  type ProviderName,
} from '../providers/index.js';
import { loadEnvFile } from '../env.js';

// Load .env from project root — launchd-spawned subprocesses don't inherit
// shell env, so OTEL_ENABLED + DB URL + provider keys must be loaded here
// (claw-1ejd; mirrors src/index.ts).
loadEnvFile(resolve(process.env.PROJECT_ROOT || process.cwd(), '.env'));

const CLASSIFIER_VERSION = 'edges-v1-2026-05-03';

interface CliArgs {
  sinceDays?: number;
  maxCostUsd: number;
  dryRun: boolean;
  resumeRunId?: string;
  providerFlag?: ProviderName;
}

function parseArgs(argv: string[]): CliArgs {
  const out: CliArgs = {
    maxCostUsd: Number(process.env.R2MCP_EDGE_MAX_USD ?? '1.00'),
    dryRun: false,
  };
  for (const arg of argv) {
    if (arg === '--dry-run') out.dryRun = true;
    else if (arg.startsWith('--max-cost=')) out.maxCostUsd = Number(arg.split('=')[1]);
    else if (arg.startsWith('--resume=')) out.resumeRunId = arg.split('=')[1];
    else if (arg.startsWith('--since=')) {
      const raw = arg.split('=')[1];
      const m = raw.match(/^(\d+)d$/);
      if (!m) throw new Error(`--since must be Nd (e.g. 7d), got ${raw}`);
      out.sinceDays = Number(m[1]);
    } else if (arg.startsWith('--provider=')) {
      const raw = arg.split('=')[1];
      if (!isProviderName(raw)) {
        throw new Error(`--provider must be one of claude-code|anthropic|openrouter, got ${raw}`);
      }
      out.providerFlag = raw;
    }
  }
  return out;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const runId = args.resumeRunId ?? randomUUID();

  const dataDir = resolve(process.env.R2MCP_EDGE_DATA_DIR ?? 'data');
  const state = new StateStore(
    resolve(dataDir, 'edges-state.jsonl'),
    resolve(dataDir, 'edges-state.last-run'),
  );
  const summaryWriter = new RunSummaryWriter(resolve(dataDir, 'edges-state.runs'));

  await initDb();
  const pool = getPool();

  // Lazy-create the provider only for non-dry-run paths. Dry-run is read-only
  // and never calls into a provider, so don't fail if none is configured.
  const provider = args.dryRun ? null : await selectProvider({ flag: args.providerFlag });

  const summary = await withToolSpan(
    'classify_edges',
    {
      run_id: runId,
      dry_run: args.dryRun,
      max_cost_usd: args.maxCostUsd,
      provider: provider?.name ?? 'dry-run',
    },
    () =>
      runClassifier(
        { runId, maxCostUsd: args.maxCostUsd, dryRun: args.dryRun, sinceDays: args.sinceDays },
        {
          classifierVersion: CLASSIFIER_VERSION,
          state,
          summaryWriter,
          concurrencyLimit: provider?.concurrencyLimit ?? 1,
          providerName: provider?.name,
          findCandidatePairs: (opts) => findCandidatePairs(pool, opts),
          fetchMemoryById: async (id) => {
            const r = await pool.query<MemoryForClassify>(
              'SELECT id, content, type FROM memories WHERE id = $1',
              [id],
            );
            return r.rows[0] ?? null;
          },
          stage1Filter: (pair) => stage1HaikuFilter(provider!, pair),
          stage2Classify: (pair) => stage2OpusClassify(provider!, pair),
          insertEdge: async (fromId, toId, relation, confidence, rationale, version) => {
            const res = await pool.query<{ id: string }>(
              `INSERT INTO memory_edges (from_memory_id, to_memory_id, relation, confidence, rationale, classifier_version)
             VALUES ($1, $2, $3, $4, $5, $6)
             ON CONFLICT (from_memory_id, to_memory_id, relation) DO UPDATE
               SET confidence = EXCLUDED.confidence,
                   rationale = EXCLUDED.rationale,
                   updated_at = NOW()
             RETURNING id`,
              [fromId, toId, relation as EdgeRelation, confidence, rationale, version],
            );
            return res.rows[0].id;
          },
          estimateCost: async (pairs) => {
            const stage1 = pairs.length * 0.0005;
            const stage2 = pairs.length * 0.2 * 0.018;
            return stage1 + stage2;
          },
        },
      ),
  );

  process.stdout.write(JSON.stringify(summary, null, 2) + '\n');

  await closeDb();
  process.exit(0);
}

main().catch((err) => {
  if (err instanceof ProviderUnavailableError) {
    process.stderr.write(`${err.message}\n`);
  } else {
    process.stderr.write(`ERROR: ${err instanceof Error ? err.message : String(err)}\n`);
  }
  process.exit(1);
});
