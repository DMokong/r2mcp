import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runClassifier, type ClassifierDeps } from '../../src/edges/classifier.js';
import { StateStore, RunSummaryWriter } from '../../src/edges/state.js';
import type { CandidatePair } from '../../src/edges/candidate-pairs.js';

let tmp: string;
beforeEach(() => { tmp = mkdtempSync(join(tmpdir(), 'edges-cls-')); });
afterEach(() => { rmSync(tmp, { recursive: true, force: true }); });

function makeDeps(overrides: Partial<ClassifierDeps>): ClassifierDeps {
  const defaultMemoryById = new Map([
    ['a', { id: 'a', content: 'memory A', type: 'context' }],
    ['b', { id: 'b', content: 'memory B', type: 'context' }],
    ['c', { id: 'c', content: 'memory C', type: 'context' }],
  ]);
  return {
    findCandidatePairs: vi.fn().mockResolvedValue([] as CandidatePair[]),
    fetchMemoryById: vi.fn(async (id: string) => defaultMemoryById.get(id) ?? null),
    stage1Filter: vi.fn().mockResolvedValue({ pass: true, comment: '', cost_usd: 0.0005 }),
    stage2Classify: vi.fn().mockResolvedValue({ kind: 'classified', relation: 'related_to', confidence: 0.4, rationale: 'r', cost_usd: 0.018 }),
    insertEdge: vi.fn().mockResolvedValue('edge-id'),
    state: new StateStore(join(tmp, 's.jsonl'), join(tmp, 's.last-run')),
    summaryWriter: new RunSummaryWriter(join(tmp, 'runs')),
    classifierVersion: 'v1-test',
    ...overrides,
  };
}

describe('runClassifier — cost cap', () => {
  it('stops issuing Stage 2 calls once running cost would exceed cap', async () => {
    // 5 pairs, all pass Stage 1, each Stage 2 costs 0.018. Cap 0.05 → 2 Stage-2 calls then stop.
    const pairs: CandidatePair[] = [
      { from_id: 'a', to_id: 'b', shared_topics: ['t'], shared_people: [] },
      { from_id: 'a', to_id: 'c', shared_topics: ['t'], shared_people: [] },
      { from_id: 'b', to_id: 'c', shared_topics: ['t'], shared_people: [] },
    ];
    const deps = makeDeps({
      findCandidatePairs: vi.fn().mockResolvedValue(pairs),
      stage1Filter: vi.fn().mockResolvedValue({ pass: true, comment: '', cost_usd: 0.0005 }),
      stage2Classify: vi.fn().mockResolvedValue({ kind: 'classified', relation: 'related_to', confidence: 0.4, rationale: 'r', cost_usd: 0.04 }),
    });
    const summary = await runClassifier({ runId: 'r1', maxCostUsd: 0.05, dryRun: false }, deps);
    expect(summary.hit_cost_cap).toBe(true);
    // First pair: stage1 (0.0005) + stage2 (0.04) = 0.0405 — under cap, both ran
    // Second pair: stage1 would push to 0.0410, then stage2 to 0.081 → would exceed → cap_reached before stage2
    // So Stage 2 was called exactly once.
    expect((deps.stage2Classify as ReturnType<typeof vi.fn>).mock.calls.length).toBe(1);
    expect(summary.total_cost_usd).toBeLessThanOrEqual(0.05);
  });
});

describe('runClassifier — resume', () => {
  it('skips pair_hashes already terminal in the state file for the same run_id', async () => {
    const pairs: CandidatePair[] = [
      { from_id: 'a', to_id: 'b', shared_topics: ['t'], shared_people: [] },
      { from_id: 'a', to_id: 'c', shared_topics: ['t'], shared_people: [] },
    ];
    const deps = makeDeps({ findCandidatePairs: vi.fn().mockResolvedValue(pairs) });
    // Pre-populate state to mark pair (a,b) as already opus_complete
    const { pairHash } = await import('../../src/edges/state.js');
    await deps.state.append({
      run_id: 'r1',
      pair_hash: pairHash('a', 'b'),
      stage: 'opus_complete',
      timestamp: new Date().toISOString(),
    });
    const summary = await runClassifier({ runId: 'r1', maxCostUsd: 1, dryRun: false }, deps);
    // Stage1 should only be called for the un-skipped pair
    expect((deps.stage1Filter as ReturnType<typeof vi.fn>).mock.calls.length).toBe(1);
    expect(summary.candidate_pairs).toBe(2);
    expect(summary.stage1_total).toBe(1);
  });
});

describe('runClassifier — dry-run', () => {
  it('writes no edges, makes no API calls, returns total_cost_usd=0', async () => {
    const pairs: CandidatePair[] = [
      { from_id: 'a', to_id: 'b', shared_topics: ['t'], shared_people: [] },
    ];
    const deps = makeDeps({ findCandidatePairs: vi.fn().mockResolvedValue(pairs) });
    const summary = await runClassifier({ runId: 'r1', maxCostUsd: 1, dryRun: true }, deps);
    expect(summary.total_cost_usd).toBe(0);
    expect(summary.edges_written).toBe(0);
    expect((deps.stage1Filter as ReturnType<typeof vi.fn>).mock.calls.length).toBe(0);
    expect((deps.stage2Classify as ReturnType<typeof vi.fn>).mock.calls.length).toBe(0);
    expect((deps.insertEdge as ReturnType<typeof vi.fn>).mock.calls.length).toBe(0);
    expect(existsSync(join(tmp, 's.last-run'))).toBe(false);
  });
});

describe('runClassifier — rejection-skip records terminal stage', () => {
  it('marks rejection-skip pairs as terminal in state', async () => {
    const pairs: CandidatePair[] = [
      { from_id: 'a', to_id: 'b', shared_topics: ['t'], shared_people: [] },
    ];
    const deps = makeDeps({
      findCandidatePairs: vi.fn().mockResolvedValue(pairs),
      stage2Classify: vi.fn().mockResolvedValue({ kind: 'rejection_skip', reason: 'r' }),
    });
    const summary = await runClassifier({ runId: 'r-rej', maxCostUsd: 1, dryRun: false }, deps);
    expect(summary.edges_written).toBe(0);
    // Resume should now find this pair as terminal
    const { pairHash } = await import('../../src/edges/state.js');
    const terminals = await deps.state.terminalPairs('r-rej');
    expect(terminals.has(pairHash('a', 'b'))).toBe(true);
  });
});
