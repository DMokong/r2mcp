/**
 * D.AC8 — provider concurrency caps are enforced by the classifier driver.
 *
 * Verifies that when the classifier dispatches N pairs, the driver respects
 * the provider's declared `concurrencyLimit` and never exceeds it.
 *
 * - claude-code: cap=2, batch=5  → peak in-flight === 2
 * - anthropic:   cap=10, batch=15 → peak in-flight === 10
 *
 * Implementation strategy: instrument the mocked `stage1Filter` with an
 * in-flight counter. The runClassifier loop wraps each pair's processing in
 * `semaphore.withPermit`, so observing `stage1Filter`'s peak concurrency is
 * a faithful proxy for the provider's peak concurrency.
 */

import { describe, it, expect, vi } from 'vitest';
import { runClassifier } from '../../src/edges/classifier.js';
import type { CandidatePair } from '../../src/edges/candidate-pairs.js';
import type { StateStore, RunSummary, RunSummaryWriter } from '../../src/edges/state.js';

function mkStub(N: number): { pairs: CandidatePair[] } {
  const pairs: CandidatePair[] = Array.from({ length: N }, (_, i) => ({
    from_id: `m-from-${i}`,
    to_id: `m-to-${i}`,
  }));
  return { pairs };
}

function makeDeps(opts: {
  concurrencyLimit: number;
  pairs: CandidatePair[];
  observe: { current: number; peak: number };
  delayMs: number;
}) {
  const writes: RunSummary[] = [];
  const stateStub: StateStore = {
    append: vi.fn(async () => { /* no-op */ }),
    markActiveRun: vi.fn(async () => { /* no-op */ }),
    terminalPairs: vi.fn(async () => new Set<string>()),
  } as unknown as StateStore;
  const summaryWriter: RunSummaryWriter = {
    write: vi.fn(async (s: RunSummary) => { writes.push(s); return 'mock'; }),
  } as unknown as RunSummaryWriter;

  return {
    deps: {
      classifierVersion: 'test',
      state: stateStub,
      summaryWriter,
      concurrencyLimit: opts.concurrencyLimit,
      providerName: 'mock',
      findCandidatePairs: async () => opts.pairs,
      fetchMemoryById: async (id: string) => ({ id, content: `c${id}`, type: 'context' as const }),
      stage1Filter: async () => {
        opts.observe.current++;
        if (opts.observe.current > opts.observe.peak) opts.observe.peak = opts.observe.current;
        await new Promise((r) => setTimeout(r, opts.delayMs));
        opts.observe.current--;
        return { pass: false, comment: 'ok', cost_usd: 0 };
      },
      stage2Classify: async () => ({ kind: 'classified' as const, relation: 'none' as const, confidence: 0, rationale: '', cost_usd: 0 }),
      insertEdge: async () => 'edge-id',
    },
    writes,
  };
}

describe('runClassifier concurrency cap (D.AC8)', () => {
  it('claude-code (cap=2) with 5 pairs never exceeds 2 in-flight', async () => {
    const { pairs } = mkStub(5);
    const observe = { current: 0, peak: 0 };
    const { deps } = makeDeps({ concurrencyLimit: 2, pairs, observe, delayMs: 10 });
    const summary = await runClassifier(
      { runId: 'r-cc-2', maxCostUsd: 100, dryRun: false },
      deps,
    );
    expect(observe.peak).toBe(2);
    expect(summary.stage1_total).toBe(5);
    expect(summary.provider).toBe('mock');
  });

  it('anthropic/openrouter (cap=10) with 15 pairs peaks at exactly 10', async () => {
    const { pairs } = mkStub(15);
    const observe = { current: 0, peak: 0 };
    const { deps } = makeDeps({ concurrencyLimit: 10, pairs, observe, delayMs: 8 });
    const summary = await runClassifier(
      { runId: 'r-ant-10', maxCostUsd: 100, dryRun: false },
      deps,
    );
    expect(observe.peak).toBe(10);
    expect(summary.stage1_total).toBe(15);
  });

  it('respects sequential mode (cap=1) when no concurrencyLimit is given', async () => {
    const { pairs } = mkStub(4);
    const observe = { current: 0, peak: 0 };
    // concurrencyLimit omitted → driver defaults to 1
    const writes: RunSummary[] = [];
    const stateStub: StateStore = {
      append: vi.fn(async () => { /* no-op */ }),
      markActiveRun: vi.fn(async () => { /* no-op */ }),
      terminalPairs: vi.fn(async () => new Set<string>()),
    } as unknown as StateStore;
    const summaryWriter: RunSummaryWriter = {
      write: vi.fn(async (s: RunSummary) => { writes.push(s); return 'mock'; }),
    } as unknown as RunSummaryWriter;
    await runClassifier(
      { runId: 'r-seq-1', maxCostUsd: 100, dryRun: false },
      {
        classifierVersion: 'test',
        state: stateStub,
        summaryWriter,
        findCandidatePairs: async () => pairs,
        fetchMemoryById: async (id: string) => ({ id, content: 'c', type: 'context' }),
        stage1Filter: async () => {
          observe.current++;
          if (observe.current > observe.peak) observe.peak = observe.current;
          await new Promise((r) => setTimeout(r, 5));
          observe.current--;
          return { pass: false, comment: 'ok', cost_usd: 0 };
        },
        stage2Classify: async () => ({ kind: 'classified' as const, relation: 'none' as const, confidence: 0, rationale: '', cost_usd: 0 }),
        insertEdge: async () => 'edge-id',
      },
    );
    expect(observe.peak).toBe(1);
  });
});
