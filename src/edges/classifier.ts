import type { CandidatePair } from './candidate-pairs.js';
import type { Stage1Result } from './stage1-haiku.js';
import type { Stage2Result, MemoryForClassify } from './stage2-opus.js';
import type { StateStore, RunSummary, RunSummaryWriter } from './state.js';
import { pairHash } from './state.js';
import type { EdgeRelation } from './types.js';
import { Semaphore } from '../providers/semaphore.js';

export interface ClassifierDeps {
  findCandidatePairs: (opts: { sinceDays?: number }) => Promise<CandidatePair[]>;
  fetchMemoryById: (id: string) => Promise<MemoryForClassify | null>;
  stage1Filter: (pair: { from: { id: string; content: string }; to: { id: string; content: string } }) => Promise<Stage1Result>;
  stage2Classify: (pair: { from: MemoryForClassify; to: MemoryForClassify }) => Promise<Stage2Result>;
  insertEdge: (
    fromId: string,
    toId: string,
    relation: EdgeRelation,
    confidence: number,
    rationale: string,
    classifierVersion: string,
  ) => Promise<string>;
  state: StateStore;
  summaryWriter: RunSummaryWriter;
  classifierVersion: string;
  estimateCost?: (pairs: CandidatePair[]) => Promise<number>;
  /**
   * Per-provider concurrency cap. Defaults to 1 (sequential — preserves
   * the SPEC-043 behavior). Set to LLMProvider.concurrencyLimit at the call
   * site to enable concurrent dispatch (D.R6, D.AC8).
   */
  concurrencyLimit?: number;
  /** Reports the active provider name into the run summary (D.R3). */
  providerName?: string;
}

export interface RunOptions {
  runId: string;
  maxCostUsd: number;
  dryRun: boolean;
  sinceDays?: number;
}

// Conservative pre-call cost estimates per stage (USD).
// Ground truth lives in AnthropicProvider.priceForTokens; revisit if pricing changes.
const STAGE1_EST_COST_USD = 0.0005;
const STAGE2_EST_COST_USD = 0.04;

interface Counters {
  stage1Total: number;
  stage1Pass: number;
  stage1Skip: number;
  stage2Total: number;
  stage2Classified: number;
  edgesWritten: number;
  totalCost: number;
  hitCap: boolean;
}

export async function runClassifier(opts: RunOptions, deps: ClassifierDeps): Promise<RunSummary> {
  const startedAt = new Date().toISOString();
  const candidates = await deps.findCandidatePairs({ sinceDays: opts.sinceDays });

  // Resume: skip terminal pair_hashes
  const terminals = await deps.state.terminalPairs(opts.runId);

  const counters: Counters = {
    stage1Total: 0, stage1Pass: 0, stage1Skip: 0,
    stage2Total: 0, stage2Classified: 0,
    edgesWritten: 0, totalCost: 0, hitCap: false,
  };

  if (opts.dryRun) {
    let estimate = 0;
    if (deps.estimateCost) {
      estimate = await deps.estimateCost(candidates);
    } else {
      estimate = candidates.length * 0.018;
    }
    process.stdout.write(`Estimated cost for full run: $${estimate.toFixed(2)} (${candidates.length} candidate pairs after pre-filter)\n`);
    return {
      run_id: opts.runId,
      started_at: startedAt,
      ended_at: new Date().toISOString(),
      candidate_pairs: candidates.length,
      stage1_total: 0, stage1_pass: 0, stage1_skip: 0,
      stage2_total: 0, stage2_classified: 0,
      edges_written: 0,
      total_cost_usd: 0,
      hit_cost_cap: false,
      provider: deps.providerName,
    };
  }

  await deps.state.markActiveRun(opts.runId);

  const concurrency = Math.max(1, deps.concurrencyLimit ?? 1);
  const semaphore = new Semaphore(concurrency);
  const inFlight = new Set<Promise<void>>();

  const launch = (cand: CandidatePair) => {
    const task = semaphore.withPermit(() => processPair(cand, opts, deps, counters, terminals));
    inFlight.add(task);
    void task.finally(() => inFlight.delete(task));
    return task;
  };

  // Dispatcher loop — keep up to `concurrency` pairs in flight at once.
  for (const cand of candidates) {
    if (counters.hitCap) break;
    if (inFlight.size >= concurrency) {
      await Promise.race(inFlight);
    }
    if (counters.hitCap) break;
    launch(cand);
  }
  await Promise.all([...inFlight]);

  if (counters.hitCap) {
    process.stdout.write(`Cost cap reached at $${counters.totalCost.toFixed(4)}. Resume with: npm run edges:classify -- --resume=${opts.runId}\n`);
  }

  const summary: RunSummary = {
    run_id: opts.runId,
    started_at: startedAt,
    ended_at: new Date().toISOString(),
    candidate_pairs: candidates.length,
    stage1_total: counters.stage1Total,
    stage1_pass: counters.stage1Pass,
    stage1_skip: counters.stage1Skip,
    stage2_total: counters.stage2Total,
    stage2_classified: counters.stage2Classified,
    edges_written: counters.edgesWritten,
    total_cost_usd: counters.totalCost,
    hit_cost_cap: counters.hitCap,
    provider: deps.providerName,
  };
  await deps.summaryWriter.write(summary);
  return summary;
}

async function processPair(
  cand: CandidatePair,
  opts: RunOptions,
  deps: ClassifierDeps,
  counters: Counters,
  terminals: Set<string>,
): Promise<void> {
  if (counters.hitCap) return;
  const ph = pairHash(cand.from_id, cand.to_id);
  if (terminals.has(ph)) return;

  const fromMem = await deps.fetchMemoryById(cand.from_id);
  const toMem = await deps.fetchMemoryById(cand.to_id);
  if (!fromMem || !toMem) return;

  // Pre-call cap check for Stage 1. Approximate under concurrency.
  if (counters.totalCost + STAGE1_EST_COST_USD > opts.maxCostUsd) {
    counters.hitCap = true;
    await deps.state.append({ run_id: opts.runId, pair_hash: ph, stage: 'cap_reached', timestamp: new Date().toISOString() });
    return;
  }

  counters.stage1Total++;
  const s1 = await deps.stage1Filter({ from: fromMem, to: toMem });
  counters.totalCost += s1.cost_usd;

  if (!s1.pass) {
    counters.stage1Skip++;
    await deps.state.append({ run_id: opts.runId, pair_hash: ph, stage: 'haiku_skip', timestamp: new Date().toISOString(), cost_usd: s1.cost_usd });
    return;
  }

  counters.stage1Pass++;
  await deps.state.append({ run_id: opts.runId, pair_hash: ph, stage: 'haiku_pass', timestamp: new Date().toISOString(), cost_usd: s1.cost_usd });

  // Pre-call cap check for Stage 2.
  if (counters.totalCost + STAGE2_EST_COST_USD > opts.maxCostUsd) {
    counters.hitCap = true;
    await deps.state.append({ run_id: opts.runId, pair_hash: ph, stage: 'cap_reached', timestamp: new Date().toISOString() });
    return;
  }

  counters.stage2Total++;
  const s2 = await deps.stage2Classify({ from: fromMem, to: toMem });

  if (s2.kind === 'rejection_skip') {
    await deps.state.append({ run_id: opts.runId, pair_hash: ph, stage: 'rejection_skip', timestamp: new Date().toISOString() });
    process.stdout.write(`SKIP rejection-pair {memory_id: ${fromMem.id}, type: ${fromMem.type}}, {memory_id: ${toMem.id}, type: ${toMem.type}} — ${s2.reason}\n`);
    return;
  }

  counters.totalCost += s2.cost_usd;
  counters.stage2Classified++;

  if (s2.relation !== 'none' && s2.confidence > 0) {
    const edgeId = await deps.insertEdge(
      fromMem.id, toMem.id, s2.relation, s2.confidence, s2.rationale, deps.classifierVersion,
    );
    counters.edgesWritten++;
    await deps.state.append({
      run_id: opts.runId, pair_hash: ph, stage: 'opus_complete',
      timestamp: new Date().toISOString(), cost_usd: s2.cost_usd, edge_id: edgeId,
    });
  } else {
    await deps.state.append({
      run_id: opts.runId, pair_hash: ph, stage: 'opus_complete',
      timestamp: new Date().toISOString(), cost_usd: s2.cost_usd,
    });
  }
}
