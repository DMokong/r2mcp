import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { setupEdgesTestDb, teardownEdgesTestDb, insertTestMemory } from './setup.js';
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type pg from 'pg';

let pool: pg.Pool;
let dataDir: string;

beforeAll(async () => { pool = await setupEdgesTestDb(); });
afterAll(async () => { await teardownEdgesTestDb(); });
beforeEach(() => {
  dataDir = mkdtempSync(join(tmpdir(), 'edges-dryrun-'));
});

describe('classifier --dry-run (AC4)', () => {
  it('writes no edges, makes no API calls, prints cost estimate', async () => {
    // Insert a small fixture corpus
    for (let i = 0; i < 5; i++) {
      await insertTestMemory(pool, `memory ${i}`, 'context', ['t1', 't2']);
    }
    const beforeCount = (await pool.query('SELECT count(*)::int AS c FROM memory_edges')).rows[0].c;

    const result = spawnSync(
      'npx',
      ['tsx', 'src/cli/classify-edges.ts', '--dry-run', '--resume=test-dryrun-ac4'],
      {
        cwd: process.cwd(),
        env: {
          ...process.env,
          ANTHROPIC_API_KEY: 'sk-test-not-real',
          R2MCP_EDGE_DATA_DIR: dataDir,
        },
        encoding: 'utf-8',
      },
    );

    expect(result.status).toBe(0);
    expect(result.stdout).toMatch(/Estimated cost.*\$\d+\.\d{2}/);
    expect(result.stdout).toMatch(/\d+ (candidate )?pairs?/);

    const afterCount = (await pool.query('SELECT count(*)::int AS c FROM memory_edges')).rows[0].c;
    expect(afterCount).toBe(beforeCount);

    // Dry-run does not persist any state file
    expect(existsSync(join(dataDir, 'edges-state.jsonl'))).toBe(false);
    const summaryPath = join(dataDir, 'edges-state.runs', 'test-dryrun-ac4.json');
    if (existsSync(summaryPath)) {
      const s = JSON.parse(readFileSync(summaryPath, 'utf-8'));
      expect(s.total_cost_usd).toBe(0);
    }

    rmSync(dataDir, { recursive: true, force: true });
  }, 30_000);
});
