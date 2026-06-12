import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { setupEdgesTestDb, teardownEdgesTestDb, insertTestMemory } from './setup.js';
import { spawnSync } from 'node:child_process';
import { readFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type pg from 'pg';

let pool: pg.Pool;
const realKey = process.env.ANTHROPIC_API_KEY;
const liveOnly = realKey && realKey.startsWith('sk-ant-') ? describe : describe.skip;

beforeAll(async () => { pool = await setupEdgesTestDb(); });
afterAll(async () => { await teardownEdgesTestDb(); });

liveOnly('classifier hybrid filter ratio (AC5, live)', () => {
  it('Stage 2 hits ≤ 40% of Stage 1 hits on a mostly-unrelated corpus', async () => {
    // 100 memories, each tagged with `cindy` + a distinct subsystem tag, so most pairs
    // share `cindy` but nothing else; and we add a second pre-filter-passing tag that
    // makes pairs eligible without forcing meaningful relations.
    const subsystems = ['morning-brief', 'email-triage', 'health', 'finance', 'observability'];
    for (let i = 0; i < 100; i++) {
      const sub = subsystems[i % subsystems.length];
      await insertTestMemory(
        pool,
        `corpus item ${i}: ${sub} subsystem detail #${i}`,
        'context',
        ['cindy', sub],
      );
    }

    const dataDir = mkdtempSync(join(tmpdir(), 'edges-ac5-'));
    const result = spawnSync(
      'npx',
      ['tsx', 'src/cli/classify-edges.ts', '--max-cost=50', '--resume=test-run-ac5'],
      { cwd: process.cwd(), env: { ...process.env, R2MCP_EDGE_DATA_DIR: dataDir }, encoding: 'utf-8' },
    );
    expect(result.status).toBe(0);

    const s = JSON.parse(readFileSync(join(dataDir, 'edges-state.runs', 'test-run-ac5.json'), 'utf-8'));
    // Required fields exist
    for (const k of ['candidate_pairs', 'stage1_total', 'stage1_pass', 'stage1_skip', 'stage2_total', 'stage2_classified', 'edges_written', 'total_cost_usd', 'hit_cost_cap']) {
      expect(s).toHaveProperty(k);
    }
    // Accounting
    expect(s.stage1_pass + s.stage1_skip).toBe(s.stage1_total);
    // Filter is real: Stage 2 is at most 40% of Stage 1 (target 20%, allow 2x slack)
    expect(s.stage2_total / Math.max(s.stage1_total, 1)).toBeLessThanOrEqual(0.40);
    // Filter is non-trivial
    expect(s.stage1_total).toBeGreaterThan(0);
    expect(s.stage1_skip).toBeGreaterThan(0);

    rmSync(dataDir, { recursive: true, force: true });
  }, 1_200_000);
});
