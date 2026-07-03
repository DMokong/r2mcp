import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { setupEdgesTestDb, teardownEdgesTestDb, insertTestMemory, resetEdgesTestDb } from './setup.js';
import { recall } from '../../src/tools/recall.js';
import type pg from 'pg';

let pool: pg.Pool;

beforeAll(async () => { pool = await setupEdgesTestDb(); });
afterAll(async () => { await teardownEdgesTestDb(); });
beforeEach(async () => { await resetEdgesTestDb(pool); });

describe('recall() signals[] — contradicts (AC7)', () => {
  it('surfaces contradicts edge as a signal without re-ranking results', async () => {
    const A = await insertTestMemory(pool, 'use library X for HTTP requests', 'context', ['http', 'library']);
    const B = await insertTestMemory(pool, 'do not use X — deprecated, switch to Y', 'context', ['http', 'library']);
    // Filler so query has competition
    for (let i = 0; i < 5; i++) {
      await insertTestMemory(pool, `unrelated filler ${i} about cooking`, 'context', ['cooking']);
    }
    await pool.query(
      `INSERT INTO memory_edges (from_memory_id, to_memory_id, relation, confidence, rationale, classifier_version)
       VALUES ($1, $2, 'contradicts', 0.84, 'B explicitly contradicts A by deprecating library X', 'v1')`,
      [A, B],
    );

    const response = await recall({ query: 'library X HTTP', top_k: 5 });

    expect(response.results.find(r => r.id === A)).toBeDefined();
    expect(Array.isArray(response.signals)).toBe(true);
    const sig = response.signals!.find(
      s => s.kind === 'contradicts' && s.from_id === A && s.to_id === B,
    );
    expect(sig).toBeDefined();
    expect(typeof sig!.rationale).toBe('string');
    expect(sig!.rationale.length).toBeGreaterThanOrEqual(1);
    expect(typeof sig!.confidence).toBe('number');
    expect(sig!.confidence).toBeGreaterThanOrEqual(0);
    expect(sig!.confidence).toBeLessThanOrEqual(1);

    // Existing fields unchanged
    expect(response).not.toHaveProperty('query'); // claw-ohhj.3: echo dropped
    expect(typeof response.results.length).toBe('number');
    expect(['semantic', 'fulltext_only']).toContain(response.search_mode);
  });
});
