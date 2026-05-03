#!/usr/bin/env tsx
/**
 * SPEC-044 Section B — wiki compile CLI driver.
 *
 * Usage:
 *   npm run compile-wiki -- [--tier=<name> | --all | --topic=<name>] [--dry-run] [--max-cost=USD] [--provider=<name>]
 *
 * Provider selection: same as classify-edges (claude-code → anthropic →
 * openrouter auto-fallback, --provider= overrides).
 *
 * Output goes to `<projectRoot>/memory/compiled/`. The host project gitignores
 * that path because it is regenerable.
 *
 * Exit codes:
 *   0 — completed normally OR hit cap gracefully
 *   1 — fatal error (DB, no provider, validation failure, etc.)
 */

import { randomUUID } from 'node:crypto';
import { execSync } from 'node:child_process';
import { resolve } from 'node:path';
import { initDb, getPool, closeDb } from '../src/db.js';
import {
  selectProvider,
  isProviderName,
  ProviderUnavailableError,
  type ProviderName,
} from '../src/providers/index.js';
import { runCompile } from '../src/compiler/run.js';
import type { EdgeForCompile, MemoryForCompile, Tier } from '../src/compiler/types.js';
import { withToolSpan } from '../src/telemetry.js';

interface CliArgs {
  tier?: Tier;
  all: boolean;
  topic?: string;
  dryRun: boolean;
  maxCostUsd: number;
  providerFlag?: ProviderName;
}

const VALID_TIERS: ReadonlyArray<Tier> = ['preferences', 'project-context', 'conversations'];

function isTier(s: string): s is Tier {
  return (VALID_TIERS as ReadonlyArray<string>).includes(s);
}

function parseArgs(argv: string[]): CliArgs {
  const out: CliArgs = {
    all: false,
    dryRun: false,
    maxCostUsd: Number(process.env.R2MCP_COMPILE_MAX_USD ?? '1.00'),
  };
  for (const arg of argv) {
    if (arg === '--dry-run') out.dryRun = true;
    else if (arg === '--all') out.all = true;
    else if (arg.startsWith('--tier=')) {
      const t = arg.split('=')[1];
      if (!isTier(t)) throw new Error(`--tier must be one of ${VALID_TIERS.join('|')}, got ${t}`);
      out.tier = t;
    } else if (arg.startsWith('--topic=')) {
      out.topic = arg.split('=')[1];
    } else if (arg.startsWith('--max-cost=')) {
      out.maxCostUsd = Number(arg.split('=')[1]);
    } else if (arg.startsWith('--provider=')) {
      const raw = arg.split('=')[1];
      if (!isProviderName(raw)) {
        throw new Error(`--provider must be claude-code|anthropic|openrouter, got ${raw}`);
      }
      out.providerFlag = raw;
    }
  }
  return out;
}

async function loadMemoriesFromDb(scope: CliArgs): Promise<MemoryForCompile[]> {
  const pool = getPool();
  // Load memories — filter at the SQL layer when scope is narrow.
  let where = `type != 'archived'`;
  const params: unknown[] = [];
  if (scope.tier) {
    params.push(scope.tier);
    where += ` AND tier = $${params.length}`;
  }
  if (scope.topic) {
    params.push(scope.topic);
    where += ` AND $${params.length} = ANY(topics)`;
  }
  const rows = await pool.query<{
    id: string; tier: Tier; type: string; content: string;
    topics: string[]; people: string[]; created_at: string;
  }>(
    `SELECT id, tier, type, content, topics, people, created_at::text AS created_at
     FROM memories WHERE ${where}
     ORDER BY id`,
    params,
  );
  const memories: MemoryForCompile[] = rows.rows.map((r) => ({
    id: r.id, tier: r.tier, type: r.type,
    content: r.content, topics: r.topics ?? [], people: r.people ?? [],
    created_at: r.created_at,
  }));

  // Attach inbound edges for prose framing (B.AC7). Only fetch edges that
  // touch memories we already have — keeps the query bounded.
  const ids = memories.map((m) => m.id);
  if (ids.length > 0) {
    const edgeRows = await pool.query<{
      from_memory_id: string; to_memory_id: string; relation: string;
      rationale: string; confidence: number;
    }>(
      `SELECT from_memory_id, to_memory_id, relation, rationale, confidence::float
       FROM memory_edges
       WHERE from_memory_id = ANY($1) OR to_memory_id = ANY($1)`,
      [ids],
    );
    const byId = new Map(memories.map((m) => [m.id, m]));
    for (const e of edgeRows.rows) {
      const m = byId.get(e.from_memory_id) ?? byId.get(e.to_memory_id);
      if (!m) continue;
      m.edges = m.edges ?? [];
      m.edges.push({
        from_memory_id: e.from_memory_id,
        to_memory_id: e.to_memory_id,
        relation: e.relation as EdgeForCompile['relation'],
        rationale: e.rationale,
        confidence: e.confidence,
      });
    }
  }
  return memories;
}

function gitSha(cwd: string): string | null {
  try {
    const out = execSync('git rev-parse HEAD', { cwd, stdio: ['ignore', 'pipe', 'ignore'] });
    return out.toString().trim() || null;
  } catch {
    return null;
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.tier && !args.all && !args.topic) {
    throw new Error('Specify exactly one of --tier=<name> | --all | --topic=<name>');
  }

  const projectRoot = process.env.PROJECT_ROOT || process.cwd();
  const compiledDir = resolve(projectRoot, 'memory/compiled');
  const runId = randomUUID();
  const startedAt = new Date().toISOString();
  const sourceGitSha = gitSha(projectRoot);

  await initDb();
  const provider = await selectProvider({ flag: args.providerFlag });

  const summary = await withToolSpan(
    'compile_wiki',
    {
      run_id: runId, dry_run: args.dryRun, max_cost_usd: args.maxCostUsd,
      provider: provider.name, scope: args.tier ?? args.topic ?? 'all',
    },
    () => runCompile(
      {
        tier: args.tier,
        all: args.all,
        topic: args.topic,
        dryRun: args.dryRun,
        maxCostUsd: args.maxCostUsd,
        runId,
        startedAt,
        sourceGitSha,
        compiledDir,
      },
      {
        provider,
        loadMemories: () => loadMemoriesFromDb(args),
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
