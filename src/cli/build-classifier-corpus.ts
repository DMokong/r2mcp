#!/usr/bin/env tsx
/**
 * Classifier shadow-eval corpus builder (trk-7mx.1).
 *
 * Samples ~200 pairs from the live DB — every existing memory_edges row
 * (ground truth: the relation it was written with) plus candidate pairs
 * Stage 1 rejected (ground truth: unknown; these exist so Stage-1 recall can
 * be spot-checked by a human) — and writes them to a gitignored corpus file
 * for src/cli/eval-classifiers.ts to score backends against.
 *
 * Never writes anything outside data/ (gitignored), and refuses to write if
 * the target path is not actually git-ignored. Never logs the loaded env
 * file's contents — only paths and row counts.
 *
 * Usage:
 *   npm run eval:corpus -- [--env-file=PATH] [--edge-state-file=PATH]
 *                          [--scope=NAME] [--limit=N] [--spot-check-limit=N]
 *                          [--out-dir=DIR]
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { loadEnvFile } from '../env.js';
import { initDb, getPool, closeDb } from '../db.js';
import { findCandidatePairs } from '../edges/candidate-pairs.js';
import { pairHash } from '../edges/state.js';
import type { EdgeRelation } from '../edges/types.js';
import { assertSafeDataPath } from '../classifiers/eval/safe-write.js';
import type { CorpusRecord as SharedCorpusRecord, RawMemory } from '../classifiers/eval/corpus-schema.js';

// The checkout holding .env and data/edges-state.jsonl. A git worktree has
// neither, so point R2MCP_PROJECT_ROOT (or --env-file) at the main checkout.
const DEFAULT_PROJECT_ROOT = process.env.R2MCP_PROJECT_ROOT ?? process.cwd();

export type CorpusRecord = SharedCorpusRecord;

interface CliArgs {
  envFile: string;
  edgeStateFile: string;
  scope?: string;
  corpusLimit: number;
  spotCheckLimit: number;
  outDir: string;
}

function flagValue(argv: string[], name: string): string | undefined {
  return argv.find((a) => a.startsWith(`${name}=`))?.split('=').slice(1).join('=');
}

function parseArgs(argv: string[]): CliArgs {
  const envFile = resolve(
    flagValue(argv, '--env-file') ?? process.env.R2MCP_ENV_FILE ?? join(DEFAULT_PROJECT_ROOT, '.env'),
  );
  const edgeStateFile = resolve(
    flagValue(argv, '--edge-state-file') ??
      process.env.R2MCP_EDGE_STATE_FILE ??
      join(DEFAULT_PROJECT_ROOT, 'data', 'edges-state.jsonl'),
  );
  return {
    envFile,
    edgeStateFile,
    scope: flagValue(argv, '--scope'),
    corpusLimit: Number(flagValue(argv, '--limit') ?? '200'),
    spotCheckLimit: Number(flagValue(argv, '--spot-check-limit') ?? '50'),
    outDir: resolve(flagValue(argv, '--out-dir') ?? 'data/classifier-eval'),
  };
}

/** Evenly interleaves items from each stratum until `total` is reached or all strata are exhausted. */
function roundRobinSample<T>(strata: ReadonlyArray<T[]>, total: number): T[] {
  const queues = strata.map((s) => [...s]);
  const result: T[] = [];
  let i = 0;
  while (result.length < total && queues.some((q) => q.length > 0)) {
    const q = queues[i % queues.length];
    const item = q.shift();
    if (item !== undefined) result.push(item);
    i++;
  }
  return result;
}

function readRejectedHashes(edgeStateFile: string): Set<string> {
  const rejected = new Set<string>();
  if (!existsSync(edgeStateFile)) return rejected;
  const raw = readFileSync(edgeStateFile, 'utf-8');
  for (const line of raw.split('\n')) {
    if (!line.trim()) continue;
    try {
      const rec = JSON.parse(line) as { stage?: string; pair_hash?: string };
      if (rec.stage === 'haiku_skip' && rec.pair_hash) rejected.add(rec.pair_hash);
    } catch {
      continue; // tolerate a truncated final line, same as StateStore.terminalPairs
    }
  }
  return rejected;
}

/** Canonicalizes + contains under data/ + checks git-ignore (in that order — fix #8), THEN writes. */
function writeJsonl(path: string, records: ReadonlyArray<unknown>): void {
  const canonical = assertSafeDataPath(path);
  mkdirSync(dirname(canonical), { recursive: true });
  writeFileSync(canonical, records.map((r) => JSON.stringify(r)).join('\n') + (records.length ? '\n' : ''), 'utf-8');
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  loadEnvFile(args.envFile);

  const corpusPath = join(args.outDir, 'corpus.jsonl');
  const spotCheckPath = join(args.outDir, 'spot-check.jsonl');

  await initDb();
  const pool = getPool();

  // 1. Every existing memory_edges row, across all relations — ground truth.
  const edgeRes = await pool.query<{
    from_id: string;
    to_id: string;
    relation: EdgeRelation;
    confidence: string;
    from_content: string;
    from_type: string;
    to_content: string;
    to_type: string;
  }>(`
    SELECT e.from_memory_id AS from_id, e.to_memory_id AS to_id, e.relation, e.confidence,
           m1.content AS from_content, m1.type AS from_type,
           m2.content AS to_content, m2.type AS to_type
    FROM memory_edges e
    JOIN memories m1 ON m1.id = e.from_memory_id
    JOIN memories m2 ON m2.id = e.to_memory_id
  `);

  const edgeRecords: CorpusRecord[] = edgeRes.rows.map((r) => ({
    pair_id: pairHash(r.from_id, r.to_id),
    from: { id: r.from_id, content: r.from_content, type: r.from_type },
    to: { id: r.to_id, content: r.to_content, type: r.to_type },
    source: 'memory_edge',
    relation: r.relation,
    confidence: Number(r.confidence),
    stage1_pass: true,
  }));
  const seenPairIds = new Set(edgeRecords.map((r) => r.pair_id));

  // 2. Candidate pairs Stage 1 rejected — join against edges-state.jsonl by pair_hash.
  const rejectedHashes = readRejectedHashes(args.edgeStateFile);
  const scopes = args.scope
    ? [args.scope]
    : (await pool.query<{ project_scope: string }>('SELECT DISTINCT project_scope FROM memories')).rows.map(
        (r) => r.project_scope,
      );

  const rejectedIdPairs: Array<{ fromId: string; toId: string; pairId: string }> = [];
  for (const scope of scopes) {
    const candidates = await findCandidatePairs(pool, { scope });
    for (const cand of candidates) {
      const ph = pairHash(cand.from_id, cand.to_id);
      if (!rejectedHashes.has(ph) || seenPairIds.has(ph)) continue;
      seenPairIds.add(ph);
      rejectedIdPairs.push({ fromId: cand.from_id, toId: cand.to_id, pairId: ph });
    }
  }

  const rejectedRecords: CorpusRecord[] = [];
  if (rejectedIdPairs.length > 0) {
    const ids = [...new Set(rejectedIdPairs.flatMap((p) => [p.fromId, p.toId]))];
    const memRes = await pool.query<RawMemory>('SELECT id, content, type FROM memories WHERE id = ANY($1)', [
      ids,
    ]);
    const byId = new Map(memRes.rows.map((m) => [m.id, m]));
    for (const p of rejectedIdPairs) {
      const from = byId.get(p.fromId);
      const to = byId.get(p.toId);
      if (!from || !to) continue;
      rejectedRecords.push({
        pair_id: p.pairId,
        from,
        to,
        source: 'stage1_rejected',
        relation: null,
        confidence: null,
        stage1_pass: false,
      });
    }
  }

  // 3. Stratify by relation (six relations + the rejected bucket), interleave to ~corpusLimit.
  const relationStrata = new Map<EdgeRelation, CorpusRecord[]>();
  for (const r of edgeRecords) {
    const key = r.relation as EdgeRelation;
    const bucket = relationStrata.get(key) ?? [];
    bucket.push(r);
    relationStrata.set(key, bucket);
  }
  const strata: CorpusRecord[][] = [...relationStrata.values(), rejectedRecords];
  const corpus = roundRobinSample(strata, args.corpusLimit);

  // 4. 50-pair (default) stratified spot-check subset, empty human_label for hand-labelling.
  const corpusStrata = new Map<string, CorpusRecord[]>();
  for (const r of corpus) {
    const key = r.relation ?? r.source;
    const bucket = corpusStrata.get(key) ?? [];
    bucket.push(r);
    corpusStrata.set(key, bucket);
  }
  const spotCheck = roundRobinSample([...corpusStrata.values()], args.spotCheckLimit).map((r) => ({
    ...r,
    human_label: null,
  }));

  writeJsonl(corpusPath, corpus);
  writeJsonl(spotCheckPath, spotCheck);

  const counts: Record<string, number> = {};
  for (const r of corpus) counts[r.relation ?? r.source] = (counts[r.relation ?? r.source] ?? 0) + 1;

  process.stdout.write(
    JSON.stringify(
      {
        corpus_path: corpusPath,
        spot_check_path: spotCheckPath,
        total_edges_in_db: edgeRecords.length,
        total_stage1_rejected_candidates: rejectedRecords.length,
        corpus_size: corpus.length,
        spot_check_size: spotCheck.length,
        counts_by_relation: counts,
      },
      null,
      2,
    ) + '\n',
  );

  await closeDb();
}

main().catch((err) => {
  process.stderr.write(`ERROR: ${err instanceof Error ? err.message : String(err)}\n`);
  process.exit(1);
});
