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
import { loadEnvFile, currentScope } from '../env.js';
import { shadowStage1, type ShadowMemory } from '../edges/stage1-shadow.js';
import { OpenJevClassifier, TypeSafeClassifier } from '../classifiers/index.js';
import type { ClassifierProvider } from '../classifiers/types.js';

// Load .env from project root — launchd-spawned subprocesses don't inherit
// shell env, so OTEL_ENABLED + DB URL + provider keys must be loaded here
// (claw-1ejd; mirrors src/index.ts).
loadEnvFile(resolve(process.env.PROJECT_ROOT || process.cwd(), '.env'));

const CLASSIFIER_VERSION = 'edges-v1-2026-05-03';

/**
 * trk-7mx shadow trial: R2MCP_EDGE_STAGE1_SHADOW=typesafe|openjev scores every
 * Stage-1 pair with that classifier too and logs it to edges-shadow.jsonl.
 * Decisions are untouched. Returns null (with one warning) when the backend
 * cannot start — e.g. hosted Jev without a key, or a scope not approved in
 * R2MCP_REMOTE_CLASSIFIER_SCOPES — so a shadow problem never fails the run.
 */
function makeShadowClassifier(): ClassifierProvider | null {
  const backend = process.env.R2MCP_EDGE_STAGE1_SHADOW?.trim();
  if (!backend) return null;
  try {
    if (backend === 'typesafe') return new TypeSafeClassifier({ scope: currentScope() });
    if (backend === 'openjev') return new OpenJevClassifier();
    throw new Error(`unknown backend "${backend}" (use typesafe or openjev)`);
  } catch (err) {
    process.stderr.write(
      `[shadow] disabled: ${err instanceof Error ? err.message : String(err)}\n`,
    );
    return null;
  }
}

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
  const shadowClassifier = args.dryRun ? null : makeShadowClassifier();
  const shadowLog = resolve(dataDir, 'edges-shadow.jsonl');
  const fetchShadowMemories = async (ids: [string, string]) => {
    const r = await pool.query<ShadowMemory>(
      'SELECT id, content, topics, section FROM memories WHERE id = ANY($1)',
      [ids],
    );
    const byId = new Map(r.rows.map((m) => [m.id, m]));
    return [byId.get(ids[0]), byId.get(ids[1])] as const;
  };

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
          findCandidatePairs: (opts) =>
            findCandidatePairs(pool, { ...opts, scope: currentScope() }),
          fetchMemoryById: async (id) => {
            const r = await pool.query<MemoryForClassify>(
              'SELECT id, content, type FROM memories WHERE id = $1',
              [id],
            );
            return r.rows[0] ?? null;
          },
          stage1Filter: async (pair) => {
            const primary = await stage1HaikuFilter(provider!, pair);
            if (shadowClassifier) {
              const [from, to] = await fetchShadowMemories([pair.from.id, pair.to.id]);
              if (from && to) {
                await shadowStage1(
                  { classifier: shadowClassifier, scope: currentScope(), logPath: shadowLog },
                  from,
                  to,
                  primary,
                );
              }
            }
            return primary;
          },
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
