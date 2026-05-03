import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, readFileSync, appendFileSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  StateStore,
  pairHash,
  RunSummaryWriter,
  type StageRecord,
} from '../../src/edges/state.js';

let tmp: string;

beforeEach(() => { tmp = mkdtempSync(join(tmpdir(), 'edges-state-')); });
afterEach(() => { rmSync(tmp, { recursive: true, force: true }); });

describe('pairHash', () => {
  it('is deterministic and order-independent', () => {
    expect(pairHash('a', 'b')).toBe(pairHash('b', 'a'));
    expect(pairHash('a', 'b')).not.toBe(pairHash('a', 'c'));
  });
});

describe('StateStore (R6)', () => {
  it('records and retrieves terminal stages by run_id', async () => {
    const store = new StateStore(join(tmp, 'state.jsonl'));
    await store.append({ run_id: 'r1', pair_hash: 'p1', stage: 'opus_complete', timestamp: new Date().toISOString() });
    const terminals = await store.terminalPairs('r1');
    expect(terminals.has('p1')).toBe(true);
    expect(terminals.size).toBe(1);
  });

  it('treats opus_complete, haiku_skip, cap_reached, rejection_skip as terminal', async () => {
    const store = new StateStore(join(tmp, 'state.jsonl'));
    const terminalStages: StageRecord['stage'][] = ['opus_complete', 'haiku_skip', 'cap_reached', 'rejection_skip'];
    for (const [i, stage] of terminalStages.entries()) {
      await store.append({ run_id: 'r1', pair_hash: `p${i}`, stage, timestamp: new Date().toISOString() });
    }
    await store.append({ run_id: 'r1', pair_hash: 'p99', stage: 'haiku_pass', timestamp: new Date().toISOString() });
    const terminals = await store.terminalPairs('r1');
    expect(terminals.size).toBe(4);
    expect(terminals.has('p99')).toBe(false);
  });

  it('does not cross run_id boundaries', async () => {
    const store = new StateStore(join(tmp, 'state.jsonl'));
    await store.append({ run_id: 'r1', pair_hash: 'p1', stage: 'opus_complete', timestamp: new Date().toISOString() });
    const r2terminals = await store.terminalPairs('r2');
    expect(r2terminals.size).toBe(0);
  });

  it('discards a truncated final line on read (hard-kill recovery)', async () => {
    const path = join(tmp, 'state.jsonl');
    appendFileSync(path,
      JSON.stringify({ run_id: 'r1', pair_hash: 'p1', stage: 'opus_complete', timestamp: '2026-05-03T00:00:00Z' }) + '\n' +
      '{"run_id":"r1","pair_hash":"p2","sta',  // truncated, no newline
    );
    const store = new StateStore(path);
    const terminals = await store.terminalPairs('r1');
    expect(terminals.has('p1')).toBe(true);
    expect(terminals.size).toBe(1);
  });

  it('writes last-run sidecar', async () => {
    const lastRunPath = join(tmp, 'state.last-run');
    const store = new StateStore(join(tmp, 'state.jsonl'), lastRunPath);
    await store.markActiveRun('test-run-xyz');
    expect(readFileSync(lastRunPath, 'utf-8').trim()).toBe('test-run-xyz');
  });
});

describe('RunSummaryWriter (R7b)', () => {
  it('writes a summary with all required fields', async () => {
    const dir = join(tmp, 'runs');
    const w = new RunSummaryWriter(dir);
    const summary = {
      run_id: 'r1',
      started_at: '2026-05-03T00:00:00Z',
      ended_at: '2026-05-03T00:00:30Z',
      candidate_pairs: 100,
      stage1_total: 100,
      stage1_pass: 20,
      stage1_skip: 80,
      stage2_total: 20,
      stage2_classified: 20,
      edges_written: 5,
      total_cost_usd: 0.42,
      hit_cost_cap: false,
    };
    await w.write(summary);
    const path = join(dir, 'r1.json');
    expect(existsSync(path)).toBe(true);
    const parsed = JSON.parse(readFileSync(path, 'utf-8'));
    expect(parsed).toEqual(summary);
  });
});
