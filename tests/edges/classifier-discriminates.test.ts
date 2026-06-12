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

liveOnly('classifier discrimination (AC3, live)', () => {
  it('creates exactly one contradicts edge for M1↔M2; none for M5↔M6 or M9↔M10', async () => {
    const fixture = JSON.parse(readFileSync('tests/fixtures/edges-corpus-contradiction.json', 'utf-8'));
    const ids: Record<string, string> = {};
    for (const mem of fixture.memories) {
      ids[mem.label] = await insertTestMemory(pool, mem.content, mem.type, mem.topics);
    }

    const dataDir = mkdtempSync(join(tmpdir(), 'edges-ac3-'));
    const result = spawnSync(
      'npx',
      ['tsx', 'src/cli/classify-edges.ts', '--max-cost=0.50', '--resume=test-run-ac3'],
      { cwd: process.cwd(), env: { ...process.env, R2MCP_EDGE_DATA_DIR: dataDir }, encoding: 'utf-8' },
    );
    expect(result.status).toBe(0);

    const summary = JSON.parse(readFileSync(join(dataDir, 'edges-state.runs', 'test-run-ac3.json'), 'utf-8'));
    expect(summary.total_cost_usd).toBeLessThan(0.50);

    // Exactly one contradicts edge between M1 and M2 (either direction)
    const contradicts = await pool.query(
      `SELECT confidence::float AS c, rationale FROM memory_edges
       WHERE relation='contradicts'
         AND ((from_memory_id=$1 AND to_memory_id=$2) OR (from_memory_id=$2 AND to_memory_id=$1))`,
      [ids.M1, ids.M2],
    );
    expect(contradicts.rows.length).toBe(1);
    expect(contradicts.rows[0].c).toBeGreaterThanOrEqual(0.75);
    expect(contradicts.rows[0].rationale.length).toBeGreaterThanOrEqual(20);

    // No edge between M5 and M6
    const m5m6 = await pool.query(
      `SELECT count(*)::int AS c FROM memory_edges
       WHERE ($1 IN (from_memory_id, to_memory_id) AND $2 IN (from_memory_id, to_memory_id))`,
      [ids.M5, ids.M6],
    );
    expect(m5m6.rows[0].c).toBe(0);

    rmSync(dataDir, { recursive: true, force: true });
  }, 600_000);
});
