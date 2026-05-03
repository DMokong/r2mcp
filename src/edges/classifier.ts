import type { CandidatePair } from './candidate-pairs.js';
import type { Stage1Result } from './stage1-haiku.js';
import type { Stage2Result, MemoryForClassify } from './stage2-opus.js';
import type { StateStore, RunSummary, RunSummaryWriter } from './state.js';
import { pairHash } from './state.js';
import type { EdgeRelation } from './types.js';

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
}

export interface RunOptions {
  runId: string;
  maxCostUsd: number;
  dryRun: boolean;
  sinceDays?: number;
}

export async function runClassifier(opts: RunOptions, deps: ClassifierDeps): Promise<RunSummary> {
  const startedAt = new Date().toISOString();
  const candidates = await deps.findCandidatePairs({ sinceDays: opts.sinceDays });

  // Resume: skip terminal pair_hashes
  const terminals = await deps.state.terminalPairs(opts.runId);
  await deps.state.markActiveRun(opts.runId);

  let stage1Total = 0;
  let stage1Pass = 0;
  let stage1Skip = 0;
  let stage2Total = 0;
  let stage2Classified = 0;
  let edgesWritten = 0;
  let totalCost = 0;
  let hitCap = false;

  if (opts.dryRun) {
    let estimate = 0;
    if (deps.estimateCost) {
      estimate = await deps.estimateCost(candidates);
    } else {
      // Conservative estimate: assume 100% pass Stage 1 → Stage 2 cost dominant
      estimate = candidates.length * 0.018;
    }
    process.stdout.write(`Estimated cost for full run: $${estimate.toFixed(2)} (${candidates.length} candidate pairs after pre-filter)\n`);
    const summary: RunSummary = {
      run_id: opts.runId,
      started_at: startedAt,
      ended_at: new Date().toISOString(),
      candidate_pairs: candidates.length,
      stage1_total: 0, stage1_pass: 0, stage1_skip: 0,
      stage2_total: 0, stage2_classified: 0,
      edges_written: 0,
      total_cost_usd: 0,
      hit_cost_cap: false,
    };
    // Note: dry-run does NOT write the summary file (AC4 requires no state mutation).
    return summary;
  }

  // Real run
  pairLoop: for (const cand of candidates) {
    const ph = pairHash(cand.from_id, cand.to_id);
    if (terminals.has(ph)) continue;

    const fromMem = await deps.fetchMemoryById(cand.from_id);
    const toMem   = await deps.fetchMemoryById(cand.to_id);
    if (!fromMem || !toMem) continue;

    // Pre-call cap check for Stage 1
    const stage1EstCost = 0.0005;
    if (totalCost + stage1EstCost > opts.maxCostUsd) {
      hitCap = true;
      await deps.state.append({ run_id: opts.runId, pair_hash: ph, stage: 'cap_reached', timestamp: new Date().toISOString() });
      break pairLoop;
    }

    stage1Total++;
    const s1 = await deps.stage1Filter({ from: fromMem, to: toMem });
    totalCost += s1.cost_usd;

    if (!s1.pass) {
      stage1Skip++;
      await deps.state.append({ run_id: opts.runId, pair_hash: ph, stage: 'haiku_skip', timestamp: new Date().toISOString(), cost_usd: s1.cost_usd });
      continue;
    }

    stage1Pass++;
    await deps.state.append({ run_id: opts.runId, pair_hash: ph, stage: 'haiku_pass', timestamp: new Date().toISOString(), cost_usd: s1.cost_usd });

    // Pre-call cap check for Stage 2
    const stage2EstCost = 0.04;
    if (totalCost + stage2EstCost > opts.maxCostUsd) {
      hitCap = true;
      await deps.state.append({ run_id: opts.runId, pair_hash: ph, stage: 'cap_reached', timestamp: new Date().toISOString() });
      break pairLoop;
    }

    stage2Total++;
    const s2 = await deps.stage2Classify({ from: fromMem, to: toMem });

    if (s2.kind === 'rejection_skip') {
      await deps.state.append({ run_id: opts.runId, pair_hash: ph, stage: 'rejection_skip', timestamp: new Date().toISOString() });
      // Visible audit log line — required by AC10
      process.stdout.write(`SKIP rejection-pair {memory_id: ${fromMem.id}, type: ${fromMem.type}}, {memory_id: ${toMem.id}, type: ${toMem.type}} — ${s2.reason}\n`);
      continue;
    }

    totalCost += s2.cost_usd;
    stage2Classified++;

    if (s2.relation !== 'none' && s2.confidence > 0) {
      const edgeId = await deps.insertEdge(
        fromMem.id, toMem.id, s2.relation, s2.confidence, s2.rationale, deps.classifierVersion,
      );
      edgesWritten++;
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

  if (hitCap) {
    process.stdout.write(`Cost cap reached at $${totalCost.toFixed(4)}. Resume with: npm run edges:classify -- --resume=${opts.runId}\n`);
  }

  const summary: RunSummary = {
    run_id: opts.runId,
    started_at: startedAt,
    ended_at: new Date().toISOString(),
    candidate_pairs: candidates.length,
    stage1_total: stage1Total,
    stage1_pass: stage1Pass,
    stage1_skip: stage1Skip,
    stage2_total: stage2Total,
    stage2_classified: stage2Classified,
    edges_written: edgesWritten,
    total_cost_usd: totalCost,
    hit_cost_cap: hitCap,
  };
  await deps.summaryWriter.write(summary);
  return summary;
}
