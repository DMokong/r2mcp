#!/usr/bin/env tsx
/**
 * SPEC-043 edge classifier CLI.
 *
 * Usage:
 *   npm run edges:classify -- [--since=DURATION] [--max-cost=USD] [--dry-run] [--resume=<run_id>]
 *
 * Examples:
 *   npm run edges:classify -- --dry-run                    # estimate only
 *   npm run edges:classify -- --max-cost=5.00              # full run, $5 cap
 *   npm run edges:classify -- --since=7d --max-cost=1.00   # incremental
 *   npm run edges:classify -- --resume=abc123              # continue prior run
 *
 * Exit codes:
 *   0 — completed normally OR hit cap gracefully OR dry-run completed
 *   1 — fatal error (DB unreachable, missing API key, etc.)
 */

import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { initDb, getPool, closeDb } from '../src/db.js';
import { findCandidatePairs } from '../src/edges/candidate-pairs.js';
import { EdgeAnthropicClient } from '../src/edges/anthropic-client.js';
import { stage1HaikuFilter } from '../src/edges/stage1-haiku.js';
import { stage2OpusClassify, type MemoryForClassify } from '../src/edges/stage2-opus.js';
import { StateStore, RunSummaryWriter } from '../src/edges/state.js';
import { runClassifier } from '../src/edges/classifier.js';
import type { EdgeRelation } from '../src/edges/types.js';

const CLASSIFIER_VERSION = 'edges-v1-2026-05-03';

interface CliArgs {
  sinceDays?: number;
  maxCostUsd: number;
  dryRun: boolean;
  resumeRunId?: string;
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

  // Lazy-create the Anthropic client only for non-dry-run paths
  let anthropic: EdgeAnthropicClient | null = null;
  if (!args.dryRun) anthropic = new EdgeAnthropicClient();

  const summary = await runClassifier(
    { runId, maxCostUsd: args.maxCostUsd, dryRun: args.dryRun, sinceDays: args.sinceDays },
    {
      classifierVersion: CLASSIFIER_VERSION,
      state,
      summaryWriter,
      findCandidatePairs: (opts) => findCandidatePairs(pool, opts),
      fetchMemoryById: async (id) => {
        const r = await pool.query<MemoryForClassify>(
          'SELECT id, content, type FROM memories WHERE id = $1',
          [id],
        );
        return r.rows[0] ?? null;
      },
      stage1Filter: (pair) => stage1HaikuFilter(anthropic!, pair),
      stage2Classify: (pair) => stage2OpusClassify(anthropic!, pair),
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
        // Conservative estimate: every pair passes Stage 1 → ~80% reach Stage 2 (target hit rate)
        // Use list prices: Stage 1 ~$0.0005, Stage 2 ~$0.018
        const stage1 = pairs.length * 0.0005;
        const stage2 = pairs.length * 0.20 * 0.018;
        return stage1 + stage2;
      },
    },
  );

  // Final stdout payload (R7b — also written to run-summary file by the orchestrator)
  process.stdout.write(JSON.stringify(summary, null, 2) + '\n');

  await closeDb();
  process.exit(0);
}

main().catch((err) => {
  process.stderr.write(`ERROR: ${err instanceof Error ? err.message : String(err)}\n`);
  process.exit(1);
});
