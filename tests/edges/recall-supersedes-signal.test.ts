import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { setupEdgesTestDb, teardownEdgesTestDb, insertTestMemory, resetEdgesTestDb } from './setup.js';
import { recall } from '../../src/tools/recall.js';
import type pg from 'pg';

let pool: pg.Pool;

beforeAll(async () => { pool = await setupEdgesTestDb(); });
afterAll(async () => { await teardownEdgesTestDb(); });
beforeEach(async () => { await resetEdgesTestDb(pool); });

describe('recall() signals[] — supersedes (AC8)', () => {
  it('surfaces supersession with from=older, to=newer; both memories returned', async () => {
    const B = await insertTestMemory(pool, 'use Postgres for memory storage', 'context', ['storage', 'postgres']);
    const A = await insertTestMemory(pool, 'use Postgres + pgvector for memory storage with tier semantics', 'context', ['storage', 'postgres', 'pgvector']);
    for (let i = 0; i < 5; i++) {
      await insertTestMemory(pool, `unrelated filler ${i} about cooking`, 'context', ['cooking']);
    }
    // DB convention: (from=newer, to=older, relation=supersedes)
    await pool.query(
      `INSERT INTO memory_edges (from_memory_id, to_memory_id, relation, confidence, rationale, classifier_version)
       VALUES ($1, $2, 'supersedes', 0.91, 'A refines B by adding pgvector and tier semantics over time', 'v1')`,
      [A, B],
    );

    const response = await recall({ query: 'memory storage Postgres', top_k: 5 });
    const ids = response.results.map(r => r.id);

    expect(ids).toContain(A);
    expect(ids).toContain(B);

    const sup = response.signals!.find(
      s => s.kind === 'superseded_by' && s.from_id === B && s.to_id === A,
    );
    expect(sup).toBeDefined();
    expect(sup!.confidence).toBeCloseTo(0.91, 2);
    expect(sup!.rationale.length).toBeGreaterThanOrEqual(1);

    // No contradicts signal between A and B (precision check)
    const stray = response.signals!.find(
      s => s.kind === 'contradicts' && [s.from_id, s.to_id].includes(A) && [s.from_id, s.to_id].includes(B),
    );
    expect(stray).toBeUndefined();
  });
});
