import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { setupEdgesTestDb, teardownEdgesTestDb, insertTestMemory } from './setup.js';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type pg from 'pg';

let pool: pg.Pool;
const realKey = process.env.ANTHROPIC_API_KEY;
const liveOnly = realKey && realKey.startsWith('sk-ant-') ? describe : describe.skip;

beforeAll(async () => { pool = await setupEdgesTestDb(); });
afterAll(async () => { await teardownEdgesTestDb(); });

liveOnly('classifier resume + cost cap (AC6, live)', () => {
  it('hits cap gracefully + resume continues without re-billing terminal pairs', async () => {
    const dataDir = mkdtempSync(join(tmpdir(), 'edges-resume-'));
    // Build a corpus of 30 memories all sharing topic "shared-tag" → many candidate pairs
    for (let i = 0; i < 30; i++) {
      await insertTestMemory(pool, `corpus item ${i} about subsystem ${i % 5}`, 'context', ['shared-tag', `sub${i % 5}`]);
    }

    const env = { ...process.env, R2MCP_EDGE_DATA_DIR: dataDir };
    // First run — deliberately tiny cap
    const first = spawnSync(
      'npx',
      ['tsx', 'scripts/classify-edges.ts', '--max-cost=0.05', '--resume=test-run-ac6a'],
      { cwd: process.cwd(), env, encoding: 'utf-8' },
    );
    expect(first.status).toBe(0);
    expect(first.stderr).not.toMatch(/Error:/);
    const firstSummary = JSON.parse(readFileSync(join(dataDir, 'edges-state.runs', 'test-run-ac6a.json'), 'utf-8'));
    expect(firstSummary.hit_cost_cap).toBe(true);
    expect(firstSummary.total_cost_usd).toBeLessThanOrEqual(0.06);
    expect(readFileSync(join(dataDir, 'edges-state.last-run'), 'utf-8').trim()).toBe('test-run-ac6a');

    // Resume with a large cap
    const second = spawnSync(
      'npx',
      ['tsx', 'scripts/classify-edges.ts', '--max-cost=10', '--resume=test-run-ac6a'],
      { cwd: process.cwd(), env, encoding: 'utf-8' },
    );
    expect(second.status).toBe(0);
    const secondSummary = JSON.parse(readFileSync(join(dataDir, 'edges-state.runs', 'test-run-ac6a.json'), 'utf-8'));
    // Resume processed only the un-terminal pairs
    expect(secondSummary.stage1_total + secondSummary.stage2_total)
      .toBeLessThan(firstSummary.stage1_total + firstSummary.stage2_total + secondSummary.stage1_total);

    // No duplicate edges
    const dupes = await pool.query(
      `SELECT count(*)::int AS c FROM (
        SELECT from_memory_id, to_memory_id, relation, count(*) c
        FROM memory_edges GROUP BY 1,2,3 HAVING count(*) > 1
      ) x`,
    );
    expect(dupes.rows[0].c).toBe(0);

    rmSync(dataDir, { recursive: true, force: true });
  }, 600_000);
});
